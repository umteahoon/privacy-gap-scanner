// 실행 환경별 Chromium 실행.
// - Netlify Functions(AWS Lambda): @sparticuz/chromium-min 이 원격 팩을 /tmp 로 받아 실행 (함수 용량 50MB 제한 회피)
// - 로컬(CLI/개발): devDependency 인 playwright 가 설치한 Chromium 사용
const DEFAULT_PACK_URL =
  'https://github.com/Sparticuz/chromium/releases/download/v153.0.0/chromium-v153.0.0-pack.x64.tar';

export async function launchBrowser() {
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const { chromium } = await import('playwright-core');
    const { default: serverless } = await import('@sparticuz/chromium-min');
    return chromium.launch({
      args: serverless.args,
      executablePath: await serverless.executablePath(process.env.CHROMIUM_PACK_URL || DEFAULT_PACK_URL),
      headless: true,
    });
  }
  const localPkg = 'playwright'; // 변수로 지정해 Netlify 번들에 포함되지 않도록 함
  const { chromium } = await import(localPkg);
  return chromium.launch({ headless: true });
}
