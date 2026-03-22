// Type shim for @mediapipe/tasks-vision
// The package's "exports" field breaks TS module resolution.
// We declare the module with just the types we actually use.
declare module '@mediapipe/tasks-vision' {
  export class FilesetResolver {
    static forVisionTasks(wasmFileset: string): Promise<any>;
  }

  export class ImageSegmenter {
    static createFromOptions(fileset: any, options: any): Promise<ImageSegmenter>;
    segment(image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement, callback: (result: ImageSegmenterResult) => void): void;
    close(): void;
  }

  export class FaceDetector {
    static createFromOptions(fileset: any, options: any): Promise<FaceDetector>;
    detect(image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement): FaceDetectorResult;
    close(): void;
  }

  export interface ImageSegmenterResult {
    confidenceMasks?: Array<{
      getAsFloat32Array(): Float32Array;
      width: number;
      height: number;
    }>;
    categoryMask?: any;
  }

  export interface FaceDetectorResult {
    detections: Array<{
      boundingBox: {
        originX: number;
        originY: number;
        width: number;
        height: number;
      };
      categories: Array<{
        score: number;
        categoryName: string;
      }>;
    }>;
  }
}
