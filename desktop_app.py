#!/usr/bin/env python3
"""
Native desktop UI (Tkinter) for the image -> Minecraft banner converter.

This is the entry point packaged into the Windows .exe (see
.github/workflows/build-windows.yml). Tkinter is used instead of the
Gradio web UI (app.py) here because it freezes into a single-file
PyInstaller executable far more reliably than a bundled local web server.
"""
import multiprocessing
import os
import queue
import threading
import traceback
from tkinter import (
    Tk, StringVar, IntVar, BooleanVar, DoubleVar,
    filedialog, messagebox, ttk,
)

from PIL import Image, ImageTk

APP_TITLE = "이미지 -> 마인크래프트 배너 변환기 (베드락 호환)"
PREVIEW_MAX_SIZE = 320


class BannerApp:
    def __init__(self, root):
        self.root = root
        self.root.title(APP_TITLE)
        self.root.resizable(False, False)

        self.image_path = StringVar(value="")
        self.width_var = IntVar(value=8)
        self.height_var = IntVar(value=8)
        self.format_var = StringVar(value="bedrock")
        self.gen_blocks_var = BooleanVar(value=True)
        self.gen_layering_var = BooleanVar(value=False)
        self.gen_big_var = BooleanVar(value=False)
        self.use_pattern_items_var = BooleanVar(value=False)
        self.compare_method_var = DoubleVar(value=0.5)
        self.threads_var = IntVar(value=4)
        self.output_dir = StringVar(value=os.path.join(os.path.expanduser("~"), "Desktop"))
        if not os.path.isdir(self.output_dir.get()):
            self.output_dir.set(os.path.expanduser("~"))

        self.status_var = StringVar(value="이미지를 선택하세요.")
        self._preview_photo = None  # keep a reference so Tk doesn't GC it
        self._result_queue = queue.Queue()

        self._build_layout()

    # ---------------------------------------------------------------- UI --
    def _build_layout(self):
        pad = {"padx": 8, "pady": 4}

        main = ttk.Frame(self.root, padding=12)
        main.grid(row=0, column=0, sticky="nsew")

        left = ttk.Frame(main)
        left.grid(row=0, column=0, sticky="n")
        right = ttk.Frame(main)
        right.grid(row=0, column=1, sticky="n", padx=(16, 0))

        # --- left column: inputs ---
        ttk.Button(left, text="이미지 선택...", command=self._pick_image).grid(row=0, column=0, columnspan=2, sticky="we", **pad)
        self.image_label = ttk.Label(left, text="(선택된 이미지 없음)", wraplength=220)
        self.image_label.grid(row=1, column=0, columnspan=2, sticky="w", **pad)

        ttk.Label(left, text="가로 칸 수").grid(row=2, column=0, sticky="w", **pad)
        ttk.Spinbox(left, from_=1, to=128, textvariable=self.width_var, width=8).grid(row=2, column=1, sticky="w", **pad)

        ttk.Label(left, text="세로 칸 수").grid(row=3, column=0, sticky="w", **pad)
        ttk.Spinbox(left, from_=1, to=128, textvariable=self.height_var, width=8).grid(row=3, column=1, sticky="w", **pad)

        ttk.Label(left, text="출력 형식").grid(row=4, column=0, sticky="w", **pad)
        format_frame = ttk.Frame(left)
        format_frame.grid(row=4, column=1, sticky="w", **pad)
        ttk.Radiobutton(format_frame, text="베드락", variable=self.format_var, value="bedrock").pack(anchor="w")
        ttk.Radiobutton(format_frame, text="자바", variable=self.format_var, value="java").pack(anchor="w")
        ttk.Radiobutton(format_frame, text="둘 다", variable=self.format_var, value="both").pack(anchor="w")

        advanced = ttk.LabelFrame(left, text="고급 옵션")
        advanced.grid(row=5, column=0, columnspan=2, sticky="we", **pad)
        ttk.Checkbutton(advanced, text="채움 블록 사용", variable=self.gen_blocks_var).grid(row=0, column=0, sticky="w")
        ttk.Checkbutton(advanced, text="레이어링 (느려짐)", variable=self.gen_layering_var).grid(row=1, column=0, sticky="w")
        ttk.Checkbutton(advanced, text="패턴 6겹 제한 해제", variable=self.gen_big_var).grid(row=2, column=0, sticky="w")
        ttk.Checkbutton(advanced, text="특수 패턴 아이템 허용", variable=self.use_pattern_items_var).grid(row=3, column=0, sticky="w")

        ttk.Label(left, text="저장 폴더").grid(row=6, column=0, sticky="w", **pad)
        out_frame = ttk.Frame(left)
        out_frame.grid(row=6, column=1, sticky="w", **pad)
        self.output_label = ttk.Label(out_frame, text=self._short_path(self.output_dir.get()), wraplength=160)
        self.output_label.pack(side="left")
        ttk.Button(out_frame, text="변경", command=self._pick_output_dir, width=6).pack(side="left", padx=(4, 0))

        self.convert_button = ttk.Button(left, text="변환 시작", command=self._start_conversion)
        self.convert_button.grid(row=7, column=0, columnspan=2, sticky="we", pady=(12, 4))

        self.progress = ttk.Progressbar(left, mode="indeterminate")
        self.progress.grid(row=8, column=0, columnspan=2, sticky="we", **pad)

        ttk.Label(left, textvariable=self.status_var, wraplength=260).grid(row=9, column=0, columnspan=2, sticky="w", **pad)

        # --- right column: preview ---
        self.preview_canvas = ttk.Label(right, text="미리보기", anchor="center",
                                         width=40, relief="groove")
        self.preview_canvas.grid(row=0, column=0, sticky="n", ipadx=4, ipady=4)

        self.result_label = ttk.Label(right, text="", wraplength=280, justify="left")
        self.result_label.grid(row=1, column=0, sticky="w", pady=(8, 0))

    @staticmethod
    def _short_path(path, limit=28):
        return path if len(path) <= limit else "..." + path[-limit:]

    # ------------------------------------------------------------ actions --
    def _pick_image(self):
        path = filedialog.askopenfilename(
            title="이미지 선택",
            filetypes=[("이미지 파일", "*.png *.jpg *.jpeg *.bmp *.gif *.webp"), ("모든 파일", "*.*")],
        )
        if not path:
            return
        self.image_path.set(path)
        self.image_label.configure(text=os.path.basename(path))
        self.status_var.set("변환 시작을 누르세요.")

    def _pick_output_dir(self):
        path = filedialog.askdirectory(title="저장 폴더 선택")
        if not path:
            return
        self.output_dir.set(path)
        self.output_label.configure(text=self._short_path(path))

    def _start_conversion(self):
        if not self.image_path.get():
            messagebox.showwarning(APP_TITLE, "먼저 이미지를 선택하세요.")
            return

        self.convert_button.configure(state="disabled")
        self.progress.start(12)
        self.status_var.set("변환 중... (칸이 많을수록 오래 걸려요)")

        thread = threading.Thread(target=self._run_conversion_worker, daemon=True)
        thread.start()
        self.root.after(150, self._poll_result_queue)

    def _run_conversion_worker(self):
        try:
            # Imported lazily so the window shows up instantly even though
            # numpy/opencv/scikit-image take a moment to import.
            from banner2bedrock.image_to_banners import banner_gen
            from banner2bedrock.mcstructure_writer import mcstructure_gen

            resolution = (int(self.width_var.get()), int(self.height_var.get()))
            full_image, banner_json, file_name = banner_gen(
                self.image_path.get(),
                resolution,
                self.gen_blocks_var.get(),
                self.gen_layering_var.get(),
                self.gen_big_var.get(),
                self.use_pattern_items_var.get(),
                max(1, int(self.threads_var.get())),
                float(self.compare_method_var.get()),
            )

            out_dir = self.output_dir.get()
            os.makedirs(out_dir, exist_ok=True)
            preview_path = os.path.join(out_dir, f"{file_name}_preview.png")
            full_image.save(preview_path)

            written = [preview_path]
            fmt = self.format_var.get()
            if fmt in ("bedrock", "both"):
                written.append(mcstructure_gen(file_name, banner_json, output_dir=out_dir))
            if fmt in ("java", "both"):
                from banner2bedrock.java_nbt_writer import process_data
                written.append(process_data(banner_json, file_name, output_dir=out_dir))

            self._result_queue.put(("ok", preview_path, written))
        except Exception:
            self._result_queue.put(("error", traceback.format_exc(), None))

    def _poll_result_queue(self):
        try:
            kind, payload, written = self._result_queue.get_nowait()
        except queue.Empty:
            self.root.after(150, self._poll_result_queue)
            return

        self.progress.stop()
        self.convert_button.configure(state="normal")

        if kind == "error":
            self.status_var.set("오류가 발생했습니다.")
            messagebox.showerror(APP_TITLE, payload)
            return

        preview_path = payload
        self._show_preview(preview_path)
        self.status_var.set("완료!")
        self.result_label.configure(text="저장된 파일:\n" + "\n".join(os.path.basename(p) for p in written))

    def _show_preview(self, path):
        img = Image.open(path).convert("RGBA")
        img.thumbnail((PREVIEW_MAX_SIZE, PREVIEW_MAX_SIZE), Image.NEAREST)
        self._preview_photo = ImageTk.PhotoImage(img)
        self.preview_canvas.configure(image=self._preview_photo, text="")


def main():
    root = Tk()
    try:
        style = ttk.Style(root)
        if "vista" in style.theme_names():
            style.theme_use("vista")
    except Exception:
        pass
    BannerApp(root)
    root.mainloop()


if __name__ == "__main__":
    # Required on Windows/PyInstaller: without this, every ProcessPoolExecutor
    # worker spawned by banner_gen() would re-launch the whole frozen GUI
    # instead of running as a worker process.
    multiprocessing.freeze_support()
    main()
