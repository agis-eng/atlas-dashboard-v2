export async function exportToPptx(
  slides: Array<{ imageUrl: string; title: string }>,
  projectName: string,
  width: number,
  height: number
): Promise<void> {
  // @ts-ignore - dynamic import to avoid node:fs build issue
  const PptxGenJS = (await Function('return import("pptxgenjs")')()).default;
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_16x9";

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const pptSlide = pres.addSlide();

    // Add image as full-slide background
    pptSlide.addImage({
      data: slide.imageUrl,
      x: 0,
      y: 0,
      w: "100%",
      h: "100%",
    });
  }

  const fileName = `${projectName.replace(/\s+/g, "-") || "Presentation"}.pptx`;
  await pres.writeFile({ fileName });
}
