#!/usr/bin/env python3
"""
Native desktop UI (Tkinter) for the PLATEAU -> Minecraft Java world converter.

Packaged into its own Windows .exe alongside the banner converter (see
.github/workflows/build-windows.yml). Tkinter for the same reason as
desktop_app.py: it freezes into a single-file PyInstaller build far more
reliably than a bundled local web server.

A conversion runs for minutes rather than seconds, so the work happens on a
worker thread that reports through a queue, and the window stays responsive
with a real percentage and a working Stop button.
"""
import os
import queue
import time
import sys
import threading
import traceback
import webbrowser
import tkinter as tk
from tkinter import (
    BooleanVar, DoubleVar, IntVar, StringVar, Text, Tk, END, filedialog,
    messagebox, ttk,
)

from plateau2mc.anvil import DEFAULT_DATA_VERSION
from plateau2mc.heightfit import MODE_COMPRESS, MODE_NONE, MODE_SCALE
from plateau2mc.jgd2011 import guess_zone
from plateau2mc.pipeline import (GEOMETRY_LOD1, GEOMETRY_LOD2, Cancelled,
                                 Options, _format_duration, build_world)

APP_TITLE = "PLATEAU -> 마인크래프트 자바 월드 변환기"
PLATEAU_URL = "https://www.mlit.go.jp/plateau/open-data/"

# The same anchors the CLI offers, with Korean labels for the dropdown.
PLACES = [
    ("신주쿠 (Shinjuku)", 35.690921, 139.700258),
    ("시부야 스크램블 (Shibuya)", 35.659515, 139.700501),
    ("도쿄역 (Tokyo station)", 35.681236, 139.767125),
    ("긴자 (Ginza)", 35.671989, 139.765089),
    ("아키하바라 (Akihabara)", 35.698353, 139.773114),
    ("도쿄타워 (Tokyo Tower)", 35.658581, 139.745433),
    ("스카이트리 (Skytree)", 35.710063, 139.810700),
    ("직접 입력 (lat, lon)", None, None),
]

FIT_CHOICES = [
    ("자르지 않고 1:1 그대로", MODE_NONE),
    ("초고층만 압축 (아무것도 안 잘림)", MODE_COMPRESS),
    ("전체 균일 축소", MODE_SCALE),
]

# Height presets. Bedrock's range is fixed by the game and no add-on
# extends it, so it is offered as a target to *plan for* rather than as an
# export format: build inside it on Java, then convert with Chunker.
HEIGHT_PRESETS = [
    ("바닐라 자바/베드락 (-64 ~ 319)", -64, 319),
    ("높이 확장 (-512 ~ 511)", -512, 511),
    ("높이 확장 데이터팩 (-64 ~ 1023)", -64, 1023),
    ("최대 (Anvil 한계, -2048 ~ 2047)", -2048, 2047),
]

GEOMETRY_CHOICES = [
    ("LOD2 — 실제 형상 (경사 지붕·굴곡)", GEOMETRY_LOD2),
    ("LOD1 — 바닥면 압출 (빠름)", GEOMETRY_LOD1),
]

SMOOTH_CHOICES = [
    ("끄기", 0),
    ("보통 — 곡면 계단현상 완화", 1),
    ("강하게 — 2번 반복", 2),
    ("최대 — 3번 반복", 3),
]


class PlateauApp:
    def __init__(self, root):
        self.root = root
        self.root.title(APP_TITLE)
        # The settings alone are taller than a laptop's usable height, so the
        # window is sized to fit the screen rather than to fit the content,
        # and the settings scroll inside it. Without this the run buttons and
        # the progress bar fall off the bottom edge with no way to reach them.
        self.root.minsize(760, 420)

        self.source_dir = StringVar(value="")
        self.world_dir = StringVar(value="")
        self.place_var = StringVar(value=PLACES[0][0])
        self.lat_var = DoubleVar(value=PLACES[0][1])
        self.lon_var = DoubleVar(value=PLACES[0][2])
        self.radius_var = IntVar(value=800)
        self.preset_var = StringVar(value=HEIGHT_PRESETS[1][0])
        self.min_y_var = IntVar(value=-512)
        self.max_y_var = IntVar(value=511)
        self.geometry_var = StringVar(value=GEOMETRY_CHOICES[0][0])
        self.textures_var = BooleanVar(value=True)
        self.glass_var = BooleanVar(value=True)
        self.simplify_var = IntVar(value=12)
        self.smooth_var = StringVar(value=SMOOTH_CHOICES[1][0])
        self.map_var = BooleanVar(value=True)
        self.fit_var = StringVar(value=FIT_CHOICES[0][0])
        self.sea_level_var = IntVar(value=62)
        self.terrain_var = BooleanVar(value=True)
        self.solid_var = BooleanVar(value=False)
        self.data_version_var = IntVar(value=DEFAULT_DATA_VERSION)
        self.status_var = StringVar(value="PLATEAU 폴더와 월드 폴더를 선택하세요.")

        self._queue = queue.Queue()
        self._cancel = threading.Event()
        self._worker = None
        self._started = 0.0
        self.timing_var = StringVar(value="")

        self._build_layout()
        self._on_place_change()
        self._on_preset_change()

    # ---------------------------------------------------------------- UI --
    def _build_layout(self):
        pad = {"padx": 8, "pady": 4}

        outer = ttk.Frame(self.root)
        outer.pack(fill="both", expand=True)

        # Everything that can scroll lives in the canvas; everything the user
        # must always be able to reach -- the buttons, the progress bar, the
        # log -- is packed against the bottom first, so it keeps its space no
        # matter how short the window gets.
        bottom = ttk.Frame(outer, padding=(12, 0, 12, 10))
        bottom.pack(side="bottom", fill="x")

        canvas = tk.Canvas(outer, highlightthickness=0, borderwidth=0)
        scrollbar = ttk.Scrollbar(outer, orient="vertical", command=canvas.yview)
        canvas.configure(yscrollcommand=scrollbar.set)
        scrollbar.pack(side="right", fill="y")
        canvas.pack(side="left", fill="both", expand=True)

        main = ttk.Frame(canvas, padding=12)
        window = canvas.create_window((0, 0), window=main, anchor="nw")
        main.columnconfigure(0, weight=1)

        def _on_content_resize(_event=None):
            canvas.configure(scrollregion=canvas.bbox("all"))

        def _on_canvas_resize(event):
            canvas.itemconfigure(window, width=event.width)

        main.bind("<Configure>", _on_content_resize)
        canvas.bind("<Configure>", _on_canvas_resize)

        def _on_wheel(event):
            # Windows and macOS send <MouseWheel> with a delta; X11 sends
            # button 4/5 instead.
            if event.num == 4:
                canvas.yview_scroll(-1, "units")
            elif event.num == 5:
                canvas.yview_scroll(1, "units")
            else:
                canvas.yview_scroll(-1 if event.delta > 0 else 1, "units")

        for sequence in ("<MouseWheel>", "<Button-4>", "<Button-5>"):
            self.root.bind_all(sequence, _on_wheel)

        self._main = main
        self._bottom = bottom

        # -- Input / output -------------------------------------------------
        io_box = ttk.LabelFrame(main, text="1. 데이터와 월드", padding=10)
        io_box.grid(row=0, column=0, sticky="ew", **pad)
        io_box.columnconfigure(1, weight=1)

        ttk.Label(io_box, text="PLATEAU 폴더").grid(row=0, column=0, sticky="w", **pad)
        ttk.Entry(io_box, textvariable=self.source_dir).grid(row=0, column=1, sticky="ew", **pad)
        ttk.Button(io_box, text="찾아보기", command=self._pick_source).grid(row=0, column=2, **pad)
        ttk.Label(io_box, text="압축을 푼 udx/bldg 폴더 (안에 *.gml)",
                  foreground="#666").grid(row=1, column=1, sticky="w", padx=8)
        ttk.Button(io_box, text="데이터 받는 곳 열기",
                   command=lambda: webbrowser.open(PLATEAU_URL)).grid(row=1, column=2, **pad)

        ttk.Label(io_box, text="월드 폴더").grid(row=2, column=0, sticky="w", **pad)
        ttk.Entry(io_box, textvariable=self.world_dir).grid(row=2, column=1, sticky="ew", **pad)
        ttk.Button(io_box, text="찾아보기", command=self._pick_world).grid(row=2, column=2, **pad)
        ttk.Label(io_box, text="미리 만들어 둔 빈 슈퍼플랫/보이드 세이브 폴더",
                  foreground="#666").grid(row=3, column=1, sticky="w", padx=8)

        # -- Area -----------------------------------------------------------
        area = ttk.LabelFrame(main, text="2. 범위", padding=10)
        area.grid(row=1, column=0, sticky="ew", **pad)
        area.columnconfigure(3, weight=1)

        ttk.Label(area, text="중심").grid(row=0, column=0, sticky="w", **pad)
        place = ttk.Combobox(area, textvariable=self.place_var, state="readonly",
                             values=[name for name, _, _ in PLACES], width=26)
        place.grid(row=0, column=1, sticky="w", **pad)
        place.bind("<<ComboboxSelected>>", lambda _event: self._on_place_change())

        self.coord_frame = ttk.Frame(area)
        self.coord_frame.grid(row=0, column=2, columnspan=2, sticky="w")
        ttk.Label(self.coord_frame, text="위도").pack(side="left", padx=(8, 2))
        ttk.Entry(self.coord_frame, textvariable=self.lat_var, width=11).pack(side="left")
        ttk.Label(self.coord_frame, text="경도").pack(side="left", padx=(8, 2))
        ttk.Entry(self.coord_frame, textvariable=self.lon_var, width=11).pack(side="left")

        ttk.Label(area, text="반경").grid(row=1, column=0, sticky="w", **pad)
        radius = ttk.Scale(area, from_=100, to=3000, variable=self.radius_var,
                           command=lambda _v: self._on_radius_change())
        radius.grid(row=1, column=1, columnspan=2, sticky="ew", **pad)
        self.radius_label = ttk.Label(area, text="")
        self.radius_label.grid(row=1, column=3, sticky="w", **pad)

        # -- Height ---------------------------------------------------------
        height = ttk.LabelFrame(main, text="3. 높이", padding=10)
        height.grid(row=2, column=0, sticky="ew", **pad)
        height.columnconfigure(1, weight=1)

        ttk.Label(height, text="월드 높이").grid(row=0, column=0, sticky="w", **pad)
        preset = ttk.Combobox(height, textvariable=self.preset_var, state="readonly",
                              values=[name for name, _, _ in HEIGHT_PRESETS], width=34)
        preset.grid(row=0, column=1, sticky="w", **pad)
        preset.bind("<<ComboboxSelected>>", lambda _event: self._on_preset_change())

        ttk.Label(height, text="초과 건물 처리").grid(row=1, column=0, sticky="w", **pad)
        ttk.Combobox(height, textvariable=self.fit_var, state="readonly",
                     values=[name for name, _ in FIT_CHOICES], width=34
                     ).grid(row=1, column=1, sticky="w", **pad)
        self.height_hint = ttk.Label(height, text="", foreground="#666", wraplength=640,
                                     justify="left")
        self.height_hint.grid(row=2, column=0, columnspan=3, sticky="w", padx=8, pady=(2, 0))

        # -- Look ------------------------------------------------------------
        look = ttk.LabelFrame(main, text="4. 형상과 재질", padding=10)
        look.grid(row=3, column=0, sticky="ew", **pad)
        look.columnconfigure(1, weight=1)

        ttk.Label(look, text="형상").grid(row=0, column=0, sticky="w", **pad)
        ttk.Combobox(look, textvariable=self.geometry_var, state="readonly",
                     values=[name for name, _ in GEOMETRY_CHOICES], width=34
                     ).grid(row=0, column=1, sticky="w", **pad)

        ttk.Checkbutton(look, text="텍스처 이미지로 블록 색 정하기",
                        variable=self.textures_var).grid(row=1, column=0, columnspan=2,
                                                         sticky="w", **pad)
        ttk.Checkbutton(look, text="유리 파사드는 스테인드글라스로 (콘크리트로 대체하지 않음)",
                        variable=self.glass_var).grid(row=2, column=0, columnspan=2,
                                                      sticky="w", **pad)
        ttk.Label(look, text="이미지 단순화").grid(row=3, column=0, sticky="w", **pad)
        ttk.Spinbox(look, from_=0, to=64, textvariable=self.simplify_var, width=7
                    ).grid(row=3, column=1, sticky="w", **pad)
        ttk.Label(look, text="색 (JPEG 노이즈를 평평한 패널로; 0이면 끄기)",
                  foreground="#666").grid(row=4, column=1, sticky="w", padx=8)

        ttk.Label(look, text="곡면 다듬기").grid(row=5, column=0, sticky="w", **pad)
        ttk.Combobox(look, textvariable=self.smooth_var, state="readonly",
                     values=[name for name, _ in SMOOTH_CHOICES], width=34
                     ).grid(row=5, column=1, sticky="w", **pad)
        ttk.Label(look, text="원본을 망가뜨릴 만큼 바뀌면 자동으로 중단합니다",
                  foreground="#666").grid(row=6, column=1, sticky="w", padx=8)

        # -- Extras ---------------------------------------------------------
        extra = ttk.LabelFrame(main, text="5. 기타", padding=10)
        extra.grid(row=4, column=0, sticky="ew", **pad)
        ttk.Checkbutton(extra, text="지형 생성", variable=self.terrain_var
                        ).grid(row=0, column=0, sticky="w", **pad)
        ttk.Checkbutton(extra, text="좌표 지도 출력", variable=self.map_var
                        ).grid(row=1, column=0, sticky="w", **pad)
        ttk.Checkbutton(extra, text="건물 속을 꽉 채우기 (느리고 용량 큼)",
                        variable=self.solid_var).grid(row=0, column=1, sticky="w", **pad)
        ttk.Label(extra, text="해수면 y").grid(row=0, column=2, sticky="e", **pad)
        ttk.Spinbox(extra, from_=-2000, to=2000, textvariable=self.sea_level_var,
                    width=7).grid(row=0, column=3, sticky="w", **pad)
        ttk.Label(extra, text="DataVersion").grid(row=0, column=4, sticky="e", **pad)
        ttk.Spinbox(extra, from_=2000, to=9999, textvariable=self.data_version_var,
                    width=7).grid(row=0, column=5, sticky="w", **pad)

        # -- Run ------------------------------------------------------------
        run = ttk.Frame(self._bottom)
        run.pack(fill="x")
        run.columnconfigure(2, weight=1)
        self.preview_button = ttk.Button(run, text="미리 확인 (쓰지 않음)",
                                         command=lambda: self._start(dry_run=True))
        self.preview_button.grid(row=0, column=0, **pad)
        self.run_button = ttk.Button(run, text="변환 시작", command=lambda: self._start(dry_run=False))
        self.run_button.grid(row=0, column=1, **pad)
        self.stop_button = ttk.Button(run, text="중지", command=self._stop, state="disabled")
        self.stop_button.grid(row=0, column=2, sticky="w", **pad)
        self.progress = ttk.Progressbar(run, mode="determinate", maximum=1000)
        self.progress.grid(row=1, column=0, columnspan=3, sticky="ew", **pad)
        ttk.Label(run, textvariable=self.status_var, wraplength=680, justify="left"
                  ).grid(row=2, column=0, columnspan=3, sticky="w", padx=8)
        ttk.Label(run, textvariable=self.timing_var, foreground="#666"
                  ).grid(row=3, column=0, columnspan=3, sticky="w", padx=8)

        # -- Log ------------------------------------------------------------
        log_box = ttk.LabelFrame(self._bottom, text="진행 상황", padding=6)
        log_box.pack(fill="x", pady=(6, 0))
        log_box.columnconfigure(0, weight=1)
        log_box.rowconfigure(0, weight=1)
        self.log = Text(log_box, height=6, wrap="word", state="disabled")
        self.log.grid(row=0, column=0, sticky="nsew")
        scroll = ttk.Scrollbar(log_box, command=self.log.yview)
        scroll.grid(row=0, column=1, sticky="ns")
        self.log.configure(yscrollcommand=scroll.set)

        self._on_radius_change()

    # ------------------------------------------------------------ helpers --
    def _on_place_change(self):
        for name, lat, lon in PLACES:
            if name == self.place_var.get():
                if lat is None:
                    for child in self.coord_frame.winfo_children():
                        child.configure(state="normal")
                else:
                    self.lat_var.set(lat)
                    self.lon_var.set(lon)
                    for child in self.coord_frame.winfo_children():
                        child.configure(state="disabled")
                return

    def _on_preset_change(self):
        for name, min_y, max_y in HEIGHT_PRESETS:
            if name == self.preset_var.get():
                self.min_y_var.set(min_y)
                self.max_y_var.set(max_y)
                break
        self._update_height_hint()

    def _update_height_hint(self):
        max_y = self.max_y_var.get()
        sea = self.sea_level_var.get()
        # The landmarks people notice first, measured against the range that
        # is actually configured.
        notes = []
        for label, metres in (("도쿄타워 333m", 333), ("스카이트리 634m", 634)):
            top = sea + metres
            notes.append(f"{label} → y={top} ({'들어감' if top <= max_y else '초과'})")
        self.height_hint.configure(
            text="해수면 y={} 기준: {}. 초과분은 자동으로 잘리지 않고 경고로 알려줍니다."
                 .format(sea, ", ".join(notes)))

    def _on_radius_change(self):
        radius = int(self.radius_var.get())
        self.radius_var.set(radius)
        side = radius * 2
        chunks = (radius // 8 + 1) ** 2
        self.radius_label.configure(text=f"{radius} m  ({side} x {side} m, 약 {chunks:,}청크)")

    def _pick_source(self):
        chosen = filedialog.askdirectory(title="PLATEAU udx/bldg 폴더 선택")
        if chosen:
            self.source_dir.set(chosen)
            count = sum(1 for _ in _gml_files(chosen))
            self.status_var.set(f"GML {count}개를 찾았습니다."
                                if count else "이 폴더에서 .gml 파일을 찾지 못했습니다.")

    def _pick_world(self):
        chosen = filedialog.askdirectory(title="마인크래프트 세이브 폴더 선택")
        if chosen:
            self.world_dir.set(chosen)

    def _append_log(self, message):
        self.log.configure(state="normal")
        self.log.insert(END, message + "\n")
        self.log.see(END)
        self.log.configure(state="disabled")

    # ---------------------------------------------------------------- run --
    def _options(self, dry_run):
        fit = next(value for name, value in FIT_CHOICES if name == self.fit_var.get())
        geometry = next(value for name, value in GEOMETRY_CHOICES
                        if name == self.geometry_var.get())
        smooth = next(value for name, value in SMOOTH_CHOICES
                      if name == self.smooth_var.get())
        lat, lon = float(self.lat_var.get()), float(self.lon_var.get())

        map_path = None
        if self.map_var.get() and self.world_dir.get():
            map_path = os.path.join(self.world_dir.get(), "plateau2mc_plan.html")

        return Options(
            source=[self.source_dir.get()], world=self.world_dir.get(),
            center=(lat, lon), radius=int(self.radius_var.get()),
            zone=guess_zone(lat, lon), sea_level=int(self.sea_level_var.get()),
            min_y=int(self.min_y_var.get()), max_y=int(self.max_y_var.get()),
            fit=fit, solid=self.solid_var.get(), terrain=self.terrain_var.get(),
            data_version=int(self.data_version_var.get()), dry_run=dry_run,
            geometry=geometry, textures=self.textures_var.get(),
            glass=self.glass_var.get(), simplify_colors=int(self.simplify_var.get()),
            smooth=smooth, map_path=map_path)

    def _start(self, dry_run):
        if self._worker is not None and self._worker.is_alive():
            return
        if not self.source_dir.get():
            messagebox.showwarning(APP_TITLE, "PLATEAU 폴더를 선택하세요.")
            return
        if not dry_run and not self.world_dir.get():
            messagebox.showwarning(APP_TITLE, "월드 폴더를 선택하세요.")
            return
        if not dry_run and not os.path.isdir(self.world_dir.get()):
            messagebox.showwarning(APP_TITLE, "월드 폴더가 존재하지 않습니다.")
            return

        self._update_height_hint()
        self._cancel.clear()
        self._started = time.time()
        # Determinate from the first frame: every phase now reports a share
        # of one bar, so there is nothing left to spin for.
        self.progress.configure(mode="determinate")
        self.progress["value"] = 0
        self.run_button.configure(state="disabled")
        self.preview_button.configure(state="disabled")
        self.stop_button.configure(state="normal")
        self.status_var.set("GML을 읽는 중...")
        self._append_log("--- " + ("미리 확인" if dry_run else "변환") + " 시작 ---")

        options = self._options(dry_run)
        self._worker = threading.Thread(target=self._work, args=(options,), daemon=True)
        self._worker.start()
        self.root.after(120, self._drain_queue)

    def _work(self, options):
        try:
            result = build_world(
                options,
                on_progress=lambda message, fraction=None: self._queue.put(
                    ("progress", (message, fraction))),
                should_cancel=self._cancel.is_set)
            self._queue.put(("done", result))
        except Cancelled:
            self._queue.put(("cancelled", None))
        except Exception as error:  # surfaced in the log, not swallowed
            self._queue.put(("error", (error, traceback.format_exc())))

    def _show_timing(self, fraction):
        elapsed = time.time() - self._started
        text = f"{fraction * 100:.0f}% · 경과 {_format_duration(elapsed)}"
        if fraction > 0.02 and elapsed > 2:
            remaining = elapsed * (1 - fraction) / fraction
            text += f" · 남은 시간 약 {_format_duration(remaining)}"
        self.timing_var.set(text)

    def _stop(self):
        self._cancel.set()
        self.status_var.set("중지하는 중...")

    def _drain_queue(self):
        finished = False
        while True:
            try:
                kind, payload = self._queue.get_nowait()
            except queue.Empty:
                break
            if kind == "progress":
                message, fraction = payload
                self._append_log(message)
                self.status_var.set(message)
                if fraction is not None:
                    self.progress["value"] = fraction * 1000
                    self._show_timing(fraction)
            elif kind == "done":
                self._finish_success(payload)
                finished = True
            elif kind == "cancelled":
                self.timing_var.set("")
                self._append_log("사용자가 중지했습니다.")
                self.status_var.set("중지됨. 이미 쓰인 리전 파일은 남아 있습니다.")
                finished = True
            elif kind == "error":
                error, detail = payload
                self._append_log(detail)
                self.status_var.set(f"실패: {error}")
                messagebox.showerror(APP_TITLE, str(error))
                finished = True

        if finished:
            self._reset_controls()
        elif self._worker is not None and self._worker.is_alive():
            self.root.after(120, self._drain_queue)
        else:
            self._reset_controls()

    def _reset_controls(self):
        # stop() zeroes a determinate bar, which would wipe the 100% a
        # finished run just put there; it is only needed to halt the
        # indeterminate animation.
        if self.progress["mode"] == "indeterminate":
            self.progress.stop()
        self.run_button.configure(state="normal")
        self.preview_button.configure(state="normal")
        self.stop_button.configure(state="disabled")

    def _finish_success(self, result):
        lines = [
            f"건물 {result.buildings_kept:,}채 / 청크 {result.chunk_count:,}개",
            f"높이: {result.height_description}",
            f"가장 높은 건물 {result.tallest_metres:.0f} m → y={result.highest_block_y}",
        ]
        if result.overflow_count:
            lines.append(
                f"경고: {result.overflow_count}채가 월드 천장(y={self.max_y_var.get()})을 "
                f"넘습니다. 가장 높은 것은 y={result.overflow_needs_y}까지 필요합니다. "
                f"높이를 올리거나 '초과 건물 처리'를 압축으로 바꾸세요.")

        if result.voxels:
            lines.append(f"복셀 {result.voxels:,}개 "
                         f"(정리 {result.voxels_removed:,} / 메움 {result.voxels_patched:,} "
                         f"/ 다듬기 {result.voxels_smoothed:,})")
        if result.textured_surfaces:
            lines.append(f"텍스처 적용 {result.textured_surfaces:,}면, "
                         f"그중 유리 {result.glazed_surfaces:,}면")
            top = list(result.block_counts.items())[:5]
            lines.append("주요 블록: " + ", ".join(f"{n.split(':')[-1]} {c:,}" for n, c in top))
        if result.map_files:
            lines.append(f"좌표 지도: {result.map_files[0]}")

        if result.dry_run:
            lines.append("미리 확인이라 아무것도 쓰지 않았습니다.")
        else:
            lines.append(f"리전 파일 {len(result.region_files)}개, "
                         f"청크 {result.chunks_written:,}개 저장")
            lines.append("잘린 건물 없음" if not result.clipped_buildings
                         else f"{result.clipped_buildings}채가 천장에서 잘렸습니다")
            lines.append(f"월드에 들어가서 /tp 0 {result.spawn_y} 0")
        lines.append(f"소요 {result.seconds:.0f}초")

        for line in lines:
            self._append_log(line)
        self.status_var.set(lines[-2] if len(lines) > 1 else lines[0])
        self.progress["value"] = 1000
        self.timing_var.set(f"완료 · {_format_duration(result.seconds)}")
        messagebox.showinfo(APP_TITLE, "\n".join(lines))


def _gml_files(directory):
    for root, _dirs, files in os.walk(directory):
        for name in files:
            if name.lower().endswith(".gml"):
                yield os.path.join(root, name)


def main():
    root = Tk()
    app = PlateauApp(root)
    root.update_idletasks()
    # Open as tall as the content wants, but never taller than the screen can
    # show -- the scrollbar covers the difference.
    wanted = root.winfo_reqheight()
    height = min(wanted, root.winfo_screenheight() - 120)
    root.geometry(f"{max(root.winfo_reqwidth(), 780)}x{max(height, 420)}")
    root.mainloop()
    return app


if __name__ == "__main__":
    sys.exit(main())
