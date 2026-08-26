import { parentPort, workerData } from 'node:worker_threads';
import { getErrorMessage } from './errors';
import { PdfAdapter } from './pdfAdapter';

interface PdfWorkerConfiguration {
  data: Uint8Array;
  password?: string;
}

type PdfRequest =
  | { id: number; operation: 'getText'; maxPages: number }
  | { id: number; operation: 'inspect'; pageNumbers?: number[]; maxPages: number }
  | { id: number; operation: 'renderPage'; pageNumber: number; scale: number };

const port = parentPort;
if (!port) throw new Error('PDF worker must run in a worker thread');

const configuration = workerData as PdfWorkerConfiguration;
const adapter = new PdfAdapter(configuration.data, configuration.password);
port.postMessage({ type: 'ready' });

port.on('message', (request: PdfRequest) => {
  void (async () => {
    try {
      let result: unknown;
      if (request.operation === 'getText') {
        result = await adapter.getText(request.maxPages);
      } else if (request.operation === 'inspect') {
        result = await adapter.inspect(request.pageNumbers, request.maxPages);
      } else {
        result = await adapter.renderPage(request.pageNumber, request.scale);
      }
      port.postMessage({ type: 'result', id: request.id, result });
    } catch (error) {
      port.postMessage({ type: 'error', id: request.id, error: getErrorMessage(error) });
    }
  })();
});
