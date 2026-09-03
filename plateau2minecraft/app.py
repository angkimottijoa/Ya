#!/usr/bin/env python3
"""
Desktop UI for the PLATEAU -> Minecraft Java Edition converter.

FORK: added. Upstream is command line only, and the manual's procedure is
eleven pages of installing Python, installing Poetry, editing the PATH
environment variable and composing a relative path by hand. This is the
same conversion with two folder pickers.

Tkinter rather than a bundled web UI because it freezes into a single-file
PyInstaller executable far more reliably.

Layout note: the settings scroll and the action row is pinned to the
bottom. They are not decorative choices -- the settings are taller than a
laptop's usable height, and an earlier build without this put the run
button off the bottom edge with no way to reach it.
"""
import os
import queue
import sys
import threading
import time
import tkinter as tk
import traceback
import webbrowser
from tkinter import (BooleanVar, DoubleVar, END, IntVar, StringVar, Text, Tk,
                     filedialog, messagebox, ttk)

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "src"))

from plateau2minecraft.blocks import RICH, SIMPLE
from plateau2minecraft.pipeline import (Cancelled, Options, _format_duration,
                                        build, data_center, expand_sources)

APP_TITLE = "PLATEAU → 마인크래프트 변환기"
PLATEAU_URL = "https://www.mlit.go.jp/plateau/open-data/"

PLACES = [
    ("데이터 전체 (자동 중심)", None, None),
    ("신주쿠 (Shinjuku)", 35.690921, 139.700258),
    ("시부야 스크램블 (Shibuya)", 35.659515, 139.700501),
    ("도쿄역 (Tokyo station)", 35.681236, 139.767125),
    ("긴자 (Ginza)", 35.671989, 139.765089),
    ("아키하바라 (Akihabara)", 35.698353, 139.773114),
    ("도쿄타워 (Tokyo Tower)", 35.658581, 139.745433),
    ("스카이트리 (Skytree)", 35.710063, 139.810700),
    ("직접 입력 (위도, 경도)", "manual", "manual"),
]

HEIGHT_PRESETS = [
    ("높이 확장 (-512 ~ 511)", -512, 511),
    ("바닐라 (-64 ~ 319)", -64, 319),
    ("높이 확장 데이터팩 (-64 ~ 1023)", -64, 1023),
    ("최대 (Anvil 한계, -2048 ~ 2047)", -2048, 2047),
]

PALETTE_CHOICES = [
    ("다채롭게 — 블록 56종, 실제 색에 가깝게", RICH),
    ("단순하게 — 중성색 12종, 멀리서 깔끔하게", SIMPLE),
]

SMOOTH_CHOICES = [
    ("끄기", 0),
    ("보통 — 곡면 계단현상 완화", 1),
    ("강하게 — 2번 반복", 2),
    ("최대 — 3번 반복", 3),
]

FEATURE_LABELS = [
    ("건물 (bldg)", "bldg"),
    ("도로 (tran)", "tran"),
    ("교량 (brid)", "brid"),
    ("도시설비 (frn)", "frn"),
    ("식생 (veg)", "veg"),
]


class ConverterApp:
    def __init__(self, root):
        self.root = root
        self.root.title(APP_TITLE)
        self.root.minsize(780, 440)

        self.source_dir = StringVar()
        self.output_dir = StringVar()
        self.place_var = StringVar(value=PLACES[0][0])
        self.lat_var = DoubleVar(value=35.690921)
        self.lon_var = DoubleVar(value=139.700258)
        self.radius_var = IntVar(value=0)
        self.preset_var = StringVar(value=HEIGHT_PRESETS[0][0])
        self.min_y_var = IntVar(value=-512)
        self.max_y_var = IntVar(value=511)
        self.sea_level_var = IntVar(value=62)
        self.data_version_var = IntVar(value=4189)
        self.textures_var = BooleanVar(value=True)
        self.palette_var = StringVar(value=PALETTE_CHOICES[0][0])
        self.simplify_var = IntVar(value=0)
        self.glass_var = BooleanVar(value=True)
        self.clean_var = BooleanVar(value=True)
        self.smooth_var = StringVar(value=SMOOTH_CHOICES[1][0])
        self.map_var = BooleanVar(value=True)
        self.feature_vars = {key: BooleanVar(value=(key == "bldg"))
                             for _label, key in FEATURE_LABELS}

        self.status_var = StringVar(value="PLATEAU 폴더와 출력 폴더를 고르세요.")
        self.timing_var = StringVar()
        self._queue = queue.Queue()
        self._cancel = threading.Event()
        self._worker = None
        self._started = 0.0

        self._build()
        self._on_place_change()
        self._on_preset_change()
        self._on_palette_change()

    # ---------------------------------------------------------------- UI --
    def _build(self):
        pad = {"padx": 8, "pady": 4}
        outer = ttk.Frame(self.root)
        outer.pack(fill="both", expand=True)

        # Pinned first, so it keeps its space however short the window is.
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
        main.bind("<Configure>",
                  lambda _e: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.bind("<Configure>",
                    lambda e: canvas.itemconfigure(window, width=e.width))

        def wheel(event):
            if event.num == 4:
                canvas.yview_scroll(-1, "units")
            elif event.num == 5:
                canvas.yview_scroll(1, "units")
            else:
                canvas.yview_scroll(-1 if event.delta > 0 else 1, "units")

        for sequence in ("<MouseWheel>", "<Button-4>", "<Button-5>"):
            self.root.bind_all(sequence, wheel)

        self._folders(main, pad)
        self._area(main, pad)
        self._height(main, pad)
        self._materials(main, pad)
        self._geometry(main, pad)
        self._actions(bottom, pad)

    def _folders(self, main, pad):
        box = ttk.LabelFrame(main, text="1. 폴더", padding=10)
        box.grid(row=0, column=0, sticky="ew", **pad)
        box.columnconfigure(1, weight=1)

        ttk.Label(box, text="PLATEAU 폴더").grid(row=0, column=0, sticky="w", **pad)
        ttk.Entry(box, textvariable=self.source_dir).grid(row=0, column=1, sticky="ew", **pad)
        ttk.Button(box, text="찾아보기", command=self._pick_source).grid(row=0, column=2, **pad)
        ttk.Label(box, text="압축을 푼 CityGML 폴더. 안의 udx/bldg를 알아서 찾습니다.",
                  foreground="#666").grid(row=1, column=1, sticky="w", padx=8)
        ttk.Button(box, text="데이터 받는 곳",
                   command=lambda: webbrowser.open(PLATEAU_URL)).grid(row=1, column=2, **pad)

        ttk.Label(box, text="출력 폴더").grid(row=2, column=0, sticky="w", **pad)
        ttk.Entry(box, textvariable=self.output_dir).grid(row=2, column=1, sticky="ew", **pad)
        ttk.Button(box, text="찾아보기", command=self._pick_output).grid(row=2, column=2, **pad)
        ttk.Label(box, text="여기 아래 world_data/region 에 .mca 파일이 생깁니다.",
                  foreground="#666").grid(row=3, column=1, sticky="w", padx=8)

    def _area(self, main, pad):
        box = ttk.LabelFrame(main, text="2. 범위", padding=10)
        box.grid(row=1, column=0, sticky="ew", **pad)
        box.columnconfigure(3, weight=1)

        ttk.Label(box, text="중심").grid(row=0, column=0, sticky="w", **pad)
        place = ttk.Combobox(box, textvariable=self.place_var, state="readonly", width=28,
                             values=[name for name, _, _ in PLACES])
        place.grid(row=0, column=1, sticky="w", **pad)
        place.bind("<<ComboboxSelected>>", lambda _e: self._on_place_change())

        self.coords = ttk.Frame(box)
        self.coords.grid(row=0, column=2, columnspan=2, sticky="w")
        ttk.Label(self.coords, text="위도").pack(side="left", padx=(8, 2))
        ttk.Entry(self.coords, textvariable=self.lat_var, width=11).pack(side="left")
        ttk.Label(self.coords, text="경도").pack(side="left", padx=(8, 2))
        ttk.Entry(self.coords, textvariable=self.lon_var, width=11).pack(side="left")

        ttk.Label(box, text="반경").grid(row=1, column=0, sticky="w", **pad)
        ttk.Scale(box, from_=0, to=3000, variable=self.radius_var,
                  command=lambda _v: self._on_radius_change()
                  ).grid(row=1, column=1, columnspan=2, sticky="ew", **pad)
        self.radius_label = ttk.Label(box, text="")
        self.radius_label.grid(row=1, column=3, sticky="w", **pad)

        ttk.Label(box, text="변환할 데이터").grid(row=2, column=0, sticky="w", **pad)
        features = ttk.Frame(box)
        features.grid(row=2, column=1, columnspan=3, sticky="w")
        for label, key in FEATURE_LABELS:
            ttk.Checkbutton(features, text=label, variable=self.feature_vars[key]
                            ).pack(side="left", padx=(0, 10))
        ttk.Label(box, text="도로·설비·식생은 표고가 없어 고도 0 m에 놓입니다.",
                  foreground="#666").grid(row=3, column=1, columnspan=3, sticky="w", padx=8)

    def _height(self, main, pad):
        box = ttk.LabelFrame(main, text="3. 높이", padding=10)
        box.grid(row=2, column=0, sticky="ew", **pad)
        box.columnconfigure(1, weight=1)

        ttk.Label(box, text="월드 높이").grid(row=0, column=0, sticky="w", **pad)
        preset = ttk.Combobox(box, textvariable=self.preset_var, state="readonly", width=34,
                              values=[name for name, _, _ in HEIGHT_PRESETS])
        preset.grid(row=0, column=1, sticky="w", **pad)
        preset.bind("<<ComboboxSelected>>", lambda _e: self._on_preset_change())

        ttk.Label(box, text="해수면 y").grid(row=0, column=2, sticky="e", **pad)
        spin = ttk.Spinbox(box, from_=-2000, to=2000, textvariable=self.sea_level_var,
                           width=7, command=self._update_height_hint)
        spin.grid(row=0, column=3, sticky="w", **pad)

        self.height_hint = ttk.Label(box, text="", foreground="#666", wraplength=660,
                                     justify="left")
        self.height_hint.grid(row=1, column=0, columnspan=4, sticky="w", padx=8, pady=(2, 0))

    def _materials(self, main, pad):
        box = ttk.LabelFrame(main, text="4. 재질", padding=10)
        box.grid(row=3, column=0, sticky="ew", **pad)
        box.columnconfigure(1, weight=1)

        ttk.Checkbutton(box, text="LOD2 텍스처 이미지로 블록 색 정하기",
                        variable=self.textures_var, command=self._on_palette_change
                        ).grid(row=0, column=0, columnspan=3, sticky="w", **pad)

        ttk.Label(box, text="색 표현").grid(row=1, column=0, sticky="w", **pad)
        palette = ttk.Combobox(box, textvariable=self.palette_var, state="readonly",
                               width=40, values=[name for name, _ in PALETTE_CHOICES])
        palette.grid(row=1, column=1, columnspan=2, sticky="w", **pad)
        palette.bind("<<ComboboxSelected>>", lambda _e: self._on_palette_change())

        ttk.Label(box, text="이미지 단순화").grid(row=2, column=0, sticky="w", **pad)
        ttk.Spinbox(box, from_=0, to=64, textvariable=self.simplify_var, width=7
                    ).grid(row=2, column=1, sticky="w", **pad)
        self.simplify_hint = ttk.Label(box, text="", foreground="#666", wraplength=660,
                                       justify="left")
        self.simplify_hint.grid(row=3, column=1, columnspan=2, sticky="w", padx=8)

        ttk.Checkbutton(box, text="유리 파사드는 스테인드글라스로 (콘크리트로 대체하지 않음)",
                        variable=self.glass_var).grid(row=4, column=0, columnspan=3,
                                                      sticky="w", **pad)
        ttk.Label(box, text="벽 전체를 보고 판단하므로 창문에 콘크리트가 섞이지 않습니다.",
                  foreground="#666").grid(row=5, column=1, columnspan=2, sticky="w", padx=8)

    def _geometry(self, main, pad):
        box = ttk.LabelFrame(main, text="5. 형상 정리와 출력", padding=10)
        box.grid(row=4, column=0, sticky="ew", **pad)
        box.columnconfigure(1, weight=1)

        ttk.Checkbutton(box, text="떠 있는 조각 제거 · 이음새 구멍 메우기",
                        variable=self.clean_var).grid(row=0, column=0, columnspan=3,
                                                      sticky="w", **pad)
        ttk.Label(box, text="곡면 다듬기").grid(row=1, column=0, sticky="w", **pad)
        ttk.Combobox(box, textvariable=self.smooth_var, state="readonly", width=34,
                     values=[name for name, _ in SMOOTH_CHOICES]
                     ).grid(row=1, column=1, sticky="w", **pad)
        ttk.Label(box, text="원본을 망가뜨릴 만큼 바뀌면 그 단계를 자동으로 취소합니다.",
                  foreground="#666").grid(row=2, column=1, columnspan=2, sticky="w", padx=8)

        ttk.Checkbutton(box, text="좌표 지도 출력 (plan.html)", variable=self.map_var
                        ).grid(row=3, column=0, columnspan=2, sticky="w", **pad)
        ttk.Label(box, text="DataVersion").grid(row=3, column=2, sticky="e", **pad)
        ttk.Spinbox(box, from_=2000, to=9999, textvariable=self.data_version_var, width=7
                    ).grid(row=3, column=3, sticky="w", **pad)

    def _actions(self, bottom, pad):
        run = ttk.Frame(bottom)
        run.pack(fill="x")
        run.columnconfigure(2, weight=1)
        self.preview_button = ttk.Button(run, text="미리 확인 (쓰지 않음)",
                                         command=lambda: self._start(True))
        self.preview_button.grid(row=0, column=0, **pad)
        self.run_button = ttk.Button(run, text="변환 시작", command=lambda: self._start(False))
        self.run_button.grid(row=0, column=1, **pad)
        self.stop_button = ttk.Button(run, text="중지", command=self._stop, state="disabled")
        self.stop_button.grid(row=0, column=2, sticky="w", **pad)
        self.progress = ttk.Progressbar(run, mode="determinate", maximum=1000)
        self.progress.grid(row=1, column=0, columnspan=3, sticky="ew", **pad)
        ttk.Label(run, textvariable=self.status_var, wraplength=700, justify="left"
                  ).grid(row=2, column=0, columnspan=3, sticky="w", padx=8)
        ttk.Label(run, textvariable=self.timing_var, foreground="#666"
                  ).grid(row=3, column=0, columnspan=3, sticky="w", padx=8)

        log_box = ttk.LabelFrame(bottom, text="진행 상황", padding=6)
        log_box.pack(fill="x", pady=(6, 0))
        log_box.columnconfigure(0, weight=1)
        self.log = Text(log_box, height=6, wrap="word", state="disabled")
        self.log.grid(row=0, column=0, sticky="nsew")
        scroll = ttk.Scrollbar(log_box, command=self.log.yview)
        scroll.grid(row=0, column=1, sticky="ns")
        self.log.configure(yscrollcommand=scroll.set)
        self._on_radius_change()

    # ----------------------------------------------------------- events --
    def _on_place_change(self):
        for name, lat, lon in PLACES:
            if name != self.place_var.get():
                continue
            manual = lat == "manual"
            state = "normal" if manual else "disabled"
            if not manual and lat is not None:
                self.lat_var.set(lat)
                self.lon_var.set(lon)
            for child in self.coords.winfo_children():
                child.configure(state=state)
            return

    def _on_preset_change(self):
        for name, min_y, max_y in HEIGHT_PRESETS:
            if name == self.preset_var.get():
                self.min_y_var.set(min_y)
                self.max_y_var.set(max_y)
                break
        self._update_height_hint()

    def _update_height_hint(self):
        max_y, sea = self.max_y_var.get(), self.sea_level_var.get()
        notes = [f"{label} → y={sea + m} ({'들어감' if sea + m <= max_y else '초과'})"
                 for label, m in (("도쿄타워 333m", 333), ("스카이트리 634m", 634))]
        self.height_hint.configure(
            text=f"해수면 y={sea} 기준: " + ", ".join(notes)
                 + ". 초과분은 잘리기 전에 경고로 알려줍니다.")

    def _on_palette_change(self):
        rich = self._palette() == RICH
        state = "on" if self.textures_var.get() else "off"
        if state == "off":
            self.simplify_hint.configure(
                text="텍스처를 끄면 면 종류(지붕·벽·바닥)별 기본 블록만 씁니다.")
            return
        self.simplify_hint.configure(
            text="0이면 원본 픽셀 그대로. 다채롭게 모드는 0~4, 단순하게 모드는 8~16이 어울립니다."
            if rich else
            "단순하게 모드에서는 8~16을 권합니다. JPEG 노이즈가 평평한 패널이 됩니다.")

    def _on_radius_change(self):
        radius = int(self.radius_var.get())
        self.radius_var.set(radius)
        self.radius_label.configure(
            text="파일 전체" if radius == 0 else f"{radius} m  ({radius * 2} x {radius * 2} m)")

    def _pick_source(self):
        chosen = filedialog.askdirectory(title="압축을 푼 CityGML 폴더")
        if not chosen:
            return
        self.source_dir.set(chosen)
        files = expand_sources([chosen])
        if not files:
            self.status_var.set("이 폴더에서 .gml 파일을 찾지 못했습니다.")
            return
        centre = data_center(files)
        where = (f"  중심 {centre[0]:.5f}, {centre[1]:.5f}" if centre else "")
        self.status_var.set(f"GML {len(files)}개를 찾았습니다.{where}")

    def _pick_output(self):
        chosen = filedialog.askdirectory(title="출력 폴더")
        if chosen:
            self.output_dir.set(chosen)

    def _log(self, message):
        self.log.configure(state="normal")
        self.log.insert(END, message + "\n")
        self.log.see(END)
        self.log.configure(state="disabled")

    # -------------------------------------------------------------- run --
    def _palette(self):
        return next(value for name, value in PALETTE_CHOICES
                    if name == self.palette_var.get())

    def _options(self, dry_run):
        manual_or_named = self.place_var.get() != PLACES[0][0]
        centre = ((float(self.lat_var.get()), float(self.lon_var.get()))
                  if manual_or_named else None)
        features = tuple(key for _label, key in FEATURE_LABELS
                         if self.feature_vars[key].get()) or ("bldg",)
        map_path = None
        if self.map_var.get() and self.output_dir.get():
            map_path = os.path.join(self.output_dir.get(), "plan.html")
        return Options(
            source=[self.source_dir.get()], output=self.output_dir.get(),
            center=centre, radius=int(self.radius_var.get()),
            sea_level=int(self.sea_level_var.get()),
            min_y=int(self.min_y_var.get()), max_y=int(self.max_y_var.get()),
            data_version=int(self.data_version_var.get()), features=features,
            textures=self.textures_var.get(), palette=self._palette(),
            simplify_colors=int(self.simplify_var.get()), glass=self.glass_var.get(),
            clean=self.clean_var.get(),
            smooth=next(v for n, v in SMOOTH_CHOICES if n == self.smooth_var.get()),
            map_path=map_path, dry_run=dry_run)

    def _start(self, dry_run):
        if self._worker is not None and self._worker.is_alive():
            return
        if not self.source_dir.get():
            messagebox.showwarning(APP_TITLE, "PLATEAU 폴더를 고르세요.")
            return
        if not dry_run and not self.output_dir.get():
            messagebox.showwarning(APP_TITLE, "출력 폴더를 고르세요.")
            return

        self._update_height_hint()
        self._cancel.clear()
        self._started = time.time()
        self.progress.configure(mode="determinate")
        self.progress["value"] = 0
        self.run_button.configure(state="disabled")
        self.preview_button.configure(state="disabled")
        self.stop_button.configure(state="normal")
        self.status_var.set("시작하는 중...")
        self._log("--- " + ("미리 확인" if dry_run else "변환") + " 시작 ---")

        options = self._options(dry_run)
        self._worker = threading.Thread(target=self._work, args=(options,), daemon=True)
        self._worker.start()
        self.root.after(120, self._drain)

    def _work(self, options):
        try:
            result = build(options,
                           on_progress=lambda m, f=None: self._queue.put(("progress", (m, f))),
                           should_cancel=self._cancel.is_set)
            self._queue.put(("done", (result, options)))
        except Cancelled:
            self._queue.put(("cancelled", None))
        except Exception as error:
            self._queue.put(("error", (error, traceback.format_exc())))

    def _stop(self):
        self._cancel.set()
        self.status_var.set("중지하는 중...")

    def _timing(self, fraction):
        elapsed = time.time() - self._started
        text = f"{fraction * 100:.0f}% · 경과 {_format_duration(elapsed)}"
        if fraction > 0.02 and elapsed > 2:
            text += f" · 남은 시간 약 {_format_duration(elapsed * (1 - fraction) / fraction)}"
        self.timing_var.set(text)

    def _drain(self):
        finished = False
        while True:
            try:
                kind, payload = self._queue.get_nowait()
            except queue.Empty:
                break
            if kind == "progress":
                message, fraction = payload
                self._log(message)
                self.status_var.set(message)
                if fraction is not None:
                    self.progress["value"] = fraction * 1000
                    self._timing(fraction)
            elif kind == "done":
                self._done(*payload)
                finished = True
            elif kind == "cancelled":
                self._log("사용자가 중지했습니다.")
                self.status_var.set("중지됨. 이미 쓰인 리전 파일은 남아 있습니다.")
                self.timing_var.set("")
                finished = True
            elif kind == "error":
                error, detail = payload
                self._log(detail)
                self.status_var.set(f"실패: {error}")
                self.timing_var.set("")
                messagebox.showerror(APP_TITLE, str(error))
                finished = True

        if finished or self._worker is None or not self._worker.is_alive():
            self._reset()
        else:
            self.root.after(120, self._drain)

    def _reset(self):
        self.run_button.configure(state="normal")
        self.preview_button.configure(state="normal")
        self.stop_button.configure(state="disabled")

    def _done(self, result, options):
        lines = [f"면 {result.surfaces:,}개 → 복셀 {result.voxels:,}개",
                 f"정리 -{result.removed:,} · 이음새 +{result.patched:,} · "
                 f"다듬기 {result.smoothed:,}"]
        if result.auto_centered and options.center:
            lines.append(f"자동 중심: {options.center[0]:.6f}, {options.center[1]:.6f}")
        if result.textured:
            lines.append(f"텍스처 {result.textured:,}면 · 유리 {result.glazed:,}면 · "
                         f"재질색 {result.materials_used:,}면")
            top = list(result.block_counts.items())[:5]
            lines.append("주요 블록: " + ", ".join(f"{n.split(':')[-1]} {c:,}" for n, c in top))
        lines.append(f"가장 높은 블록 y={result.highest_y:,}")

        if options.dry_run:
            lines.append("미리 확인이라 아무것도 쓰지 않았습니다.")
        else:
            lines.append(f"리전 파일 {len(result.region_files)}개")
            lines.append("잘린 복셀 없음" if not result.clipped
                         else f"{result.clipped:,}개가 높이 범위를 벗어나 잘렸습니다")
            if result.map_files:
                lines.append(f"좌표 지도: {result.map_files[0]}")
            lines.append(f"월드에 들어가서 /tp 0 {result.spawn_y} 0")
        lines.append(f"소요 {_format_duration(result.seconds)}")

        for line in lines:
            self._log(line)
        self.status_var.set(lines[0])
        self.progress["value"] = 1000
        self.timing_var.set(f"완료 · {_format_duration(result.seconds)}")
        messagebox.showinfo(APP_TITLE, "\n".join(lines))


def main():
    root = Tk()
    ConverterApp(root)
    root.update_idletasks()
    height = min(root.winfo_reqheight(), root.winfo_screenheight() - 120)
    root.geometry(f"{max(root.winfo_reqwidth(), 820)}x{max(height, 440)}")
    root.mainloop()


if __name__ == "__main__":
    main()
