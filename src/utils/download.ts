import fs from 'fs';
import http from 'http';
import https from 'https';
import os from 'os';
import path from 'path';
import { URL } from 'url';
import { APKDownloadError } from '../types';

const MAX_REDIRECTS = 5;

function resolveFileName(url: URL): string {
  const base = path.basename(url.pathname || '') || 'download.apk';
  return base.endsWith('.apk') ? base : `${base}.apk`;
}

function downloadToFile(url: URL, filePath: string, redirectsLeft: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;

    const request = client.get(url, response => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location;

      if (status >= 300 && status < 400 && location) {
        response.resume();
        if (redirectsLeft <= 0) {
          reject(new APKDownloadError(url.toString(), { status, location }));
          return;
        }

        const redirected = new URL(location, url);
        downloadToFile(redirected, filePath, redirectsLeft - 1).then(resolve).catch(reject);
        return;
      }

      if (status < 200 || status >= 300) {
        response.resume();
        reject(new APKDownloadError(url.toString(), { status }));
        return;
      }

      const fileStream = fs.createWriteStream(filePath);
      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });

      fileStream.on('error', error => {
        fileStream.close();
        fs.unlink(filePath, () => undefined);
        reject(new APKDownloadError(url.toString(), { error: error.message }));
      });
    });

    request.on('error', error => {
      fs.unlink(filePath, () => undefined);
      reject(new APKDownloadError(url.toString(), { error: error.message }));
    });
  });
}

export async function downloadApkFromUrl(url: string): Promise<string> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new APKDownloadError(url, { reason: 'unsupported_protocol' });
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'the-android-mcp-'));
  const filename = resolveFileName(parsed);
  const filePath = path.join(tempDir, filename);

  await downloadToFile(parsed, filePath, MAX_REDIRECTS);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
    throw new APKDownloadError(url, { reason: 'empty_file' });
  }

  return filePath;
}
