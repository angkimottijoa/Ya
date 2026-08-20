#!/usr/bin/env python3
"""
Browser-based UI for the image -> Minecraft banner converter.

Run with:
    python app.py

Then open the printed http://127.0.0.1:7860 link (or the one Gradio prints)
in a browser: upload an image, set the grid size, click Convert, and
download the resulting .mcstructure (Bedrock) / .nbt (Java) file.
"""
import os
import tempfile

import gradio as gr

from banner2bedrock.image_to_banners import banner_gen
from banner2bedrock.mcstructure_writer import mcstructure_gen


def run_conversion(image_path, width, height, gen_blocks, gen_layering, gen_big,
                    use_pattern_items, out_format, compare_method, threads,
                    progress=gr.Progress()):
    if image_path is None:
        yield None, None, None, "이미지를 먼저 업로드하세요."
        return

    width, height = int(width), int(height)
    if width < 1 or height < 1:
        yield None, None, None, "가로/세로 칸 수는 1 이상이어야 합니다."
        return

    progress(0, desc="배너 생성 중...")
    yield None, None, None, f"{width}x{height} 크기로 변환 중... (칸이 많을수록 오래 걸려요)"

    try:
        full_image, banner_json, file_name = banner_gen(
            image_path,
            (width, height),
            gen_blocks,
            gen_layering,
            gen_big,
            use_pattern_items,
            max(1, int(threads)),
            float(compare_method),
        )
    except Exception as e:
        yield None, None, None, f"변환 중 오류가 발생했습니다: {e}"
        return

    out_dir = tempfile.mkdtemp(prefix="banner2bedrock_")
    preview_path = os.path.join(out_dir, f"{file_name}_preview.png")
    full_image.save(preview_path)

    mcstructure_path = None
    nbt_path = None

    if out_format in ("bedrock", "both"):
        mcstructure_path = mcstructure_gen(file_name, banner_json, output_dir=out_dir)

    if out_format in ("java", "both"):
        from banner2bedrock.java_nbt_writer import process_data
        nbt_path = process_data(banner_json, file_name, output_dir=out_dir)

    yield preview_path, mcstructure_path, nbt_path, "완료! 아래에서 파일을 내려받으세요."


with gr.Blocks(title="배너 사진 변환기 (베드락 호환)") as demo:
    gr.Markdown(
        "# 이미지 → 마인크래프트 배너 변환기\n"
        "사진을 업로드하면 배너 픽셀아트로 바꿔서 **베드락에서 바로 로드 가능한 `.mcstructure`** "
        "파일로 만들어줍니다. (자바 `.nbt`도 옵션으로 같이 뽑을 수 있어요)"
    )

    with gr.Row():
        with gr.Column(scale=1):
            image_input = gr.Image(label="원본 이미지", type="filepath")

            with gr.Row():
                width_input = gr.Number(label="가로 칸 수", value=8, minimum=1, precision=0)
                height_input = gr.Number(label="세로 칸 수", value=8, minimum=1, precision=0)

            out_format = gr.Radio(
                choices=[("베드락 (.mcstructure)", "bedrock"),
                         ("자바 (.nbt)", "java"),
                         ("둘 다", "both")],
                value="bedrock", label="출력 형식",
            )

            with gr.Accordion("고급 옵션", open=False):
                gen_blocks = gr.Checkbox(value=True, label="채움 블록 사용 (배너 위/아래에 블록을 채워 디테일 향상)")
                gen_layering = gr.Checkbox(value=False, label="레이어링 (배너 한 장 더 겹쳐서 디테일 향상, 느려짐)")
                gen_big = gr.Checkbox(value=False, label="패턴 6겹 제한 해제 (더 정교하지만 훨씬 느림)")
                use_pattern_items = gr.Checkbox(value=False, label="특수 패턴 아이템 허용 (해골/크리퍼/모장로고 등)")
                compare_method = gr.Slider(0.0, 1.0, value=0.5, step=0.05,
                                            label="색상 유사도 가중치 (0=구조 위주, 1=색상 위주)")
                threads = gr.Slider(1, 16, value=4, step=1, label="동시 작업 프로세스 수")

            run_button = gr.Button("변환 시작", variant="primary")

        with gr.Column(scale=1):
            preview_output = gr.Image(label="결과 미리보기")
            status_output = gr.Textbox(label="상태", interactive=False)
            mcstructure_output = gr.File(label="베드락 구조물 파일 (.mcstructure)")
            nbt_output = gr.File(label="자바 구조물 파일 (.nbt)")

    run_button.click(
        fn=run_conversion,
        inputs=[image_input, width_input, height_input, gen_blocks, gen_layering, gen_big,
                use_pattern_items, out_format, compare_method, threads],
        outputs=[preview_output, mcstructure_output, nbt_output, status_output],
    )

    gr.Markdown(
        "### 베드락에 적용하는 법\n"
        "1. 내려받은 `.mcstructure` 파일을 월드(또는 행동팩)의 `structures/` 폴더에 넣기\n"
        "2. 인게임에서 `/give @s structure_block` 으로 구조물 블록 받기\n"
        "3. 설치 후 우클릭 → Load 모드 → 파일명(확장자 제외) 입력 → Detect Size → Load"
    )


if __name__ == "__main__":
    demo.queue().launch(server_name="0.0.0.0", server_port=7860)
