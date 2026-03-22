export interface EditMessage {
  type: 'edit';
  blob: Blob;
  operation: 'crop' | 'resize' | 'rotate' | 'flip';
  params: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    targetWidth?: number;
    targetHeight?: number;
    degrees?: 90 | 180 | 270;
    direction?: 'horizontal' | 'vertical';
  };
}

export interface EditResultMessage {
  type: 'result';
  blob: Blob;
  width: number;
  height: number;
}

export interface EditErrorMessage {
  type: 'error';
  message: string;
}

self.onmessage = async (e: MessageEvent<EditMessage>) => {
  const { blob, operation, params } = e.data;

  try {
    const bitmap = await createImageBitmap(blob);
    let { width, height } = bitmap;

    let canvas: OffscreenCanvas;
    let ctx: OffscreenCanvasRenderingContext2D;

    switch (operation) {
      case 'crop': {
        const cx = params.x ?? 0;
        const cy = params.y ?? 0;
        const cw = params.width ?? width;
        const ch = params.height ?? height;
        canvas = new OffscreenCanvas(cw, ch);
        ctx = canvas.getContext('2d')!;
        ctx.drawImage(bitmap, cx, cy, cw, ch, 0, 0, cw, ch);
        width = cw;
        height = ch;
        break;
      }

      case 'resize': {
        const tw = params.targetWidth ?? width;
        const th = params.targetHeight ?? height;
        canvas = new OffscreenCanvas(tw, th);
        ctx = canvas.getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0, tw, th);
        width = tw;
        height = th;
        break;
      }

      case 'rotate': {
        const deg = params.degrees ?? 90;
        const swap = deg === 90 || deg === 270;
        const cw2 = swap ? height : width;
        const ch2 = swap ? width : height;
        canvas = new OffscreenCanvas(cw2, ch2);
        ctx = canvas.getContext('2d')!;
        ctx.translate(cw2 / 2, ch2 / 2);
        ctx.rotate((deg * Math.PI) / 180);
        ctx.drawImage(bitmap, -width / 2, -height / 2);
        width = cw2;
        height = ch2;
        break;
      }

      case 'flip': {
        canvas = new OffscreenCanvas(width, height);
        ctx = canvas.getContext('2d')!;
        if (params.direction === 'horizontal') {
          ctx.translate(width, 0);
          ctx.scale(-1, 1);
        } else {
          ctx.translate(0, height);
          ctx.scale(1, -1);
        }
        ctx.drawImage(bitmap, 0, 0);
        break;
      }

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }

    bitmap.close();

    const resultBlob = await canvas.convertToBlob({ type: 'image/png' });

    const response: EditResultMessage = {
      type: 'result',
      blob: resultBlob,
      width,
      height,
    };
    self.postMessage(response);
  } catch (err) {
    const response: EditErrorMessage = {
      type: 'error',
      message: err instanceof Error ? err.message : 'Unknown edit error',
    };
    self.postMessage(response);
  }
};
