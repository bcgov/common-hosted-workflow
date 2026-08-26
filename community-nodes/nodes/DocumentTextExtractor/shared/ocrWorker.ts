import { parentPort, workerData } from 'node:worker_threads';
import { createWorker, OEM, type PSM } from 'tesseract.js';
import { getErrorMessage } from './errors';

interface WorkerConfiguration {
  language: string;
  pageSegmentationMode: PSM;
}

interface RecognitionRequest {
  id: number;
  image: Uint8Array;
}

const port = parentPort;
if (!port) throw new Error('OCR worker must run in a worker thread');

const configuration = workerData as WorkerConfiguration;

void (async () => {
  const worker = await createWorker(configuration.language, OEM.DEFAULT, {
    errorHandler: (error) => port.postMessage({ type: 'fatal', error: getErrorMessage(error) }),
  });
  await worker.setParameters({ tessedit_pageseg_mode: configuration.pageSegmentationMode });
  port.postMessage({ type: 'ready' });

  port.on('message', (request: RecognitionRequest) => {
    void (async () => {
      try {
        const result = await worker.recognize(Buffer.from(request.image), {}, { text: true });
        port.postMessage({
          type: 'result',
          id: request.id,
          text: result.data.text.trim(),
          confidence: result.data.confidence,
        });
      } catch (error) {
        port.postMessage({ type: 'error', id: request.id, error: getErrorMessage(error) });
      }
    })();
  });
})().catch((error: unknown) => {
  port.postMessage({ type: 'fatal', error: getErrorMessage(error) });
});
