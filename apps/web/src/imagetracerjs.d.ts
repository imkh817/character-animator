/** imagetracerjs는 타입 정의가 없다. 옵션 목록: 패키지의 options.md 참고 */
declare module 'imagetracerjs' {
  type TraceOptions = Record<string, number | boolean | string>;
  const ImageTracer: {
    /** ImageData를 트레이싱해 SVG 문자열로 만든다. options에 프리셋 이름(string)도 허용 */
    imagedataToSVG(imageData: ImageData, options?: TraceOptions | string): string;
  };
  export default ImageTracer;
}
