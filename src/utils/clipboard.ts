const pasteCommand =
  process.platform === "darwin" ? ["pbpaste"] : ["xclip", "-selection", "clipboard", "-o"];

const copyCommand =
  process.platform === "darwin" ? ["pbcopy"] : ["xclip", "-selection", "clipboard"];

export async function readClipboard(): Promise<string> {
  try {
    const proc = Bun.spawn({ cmd: pasteCommand, stdout: "pipe", stderr: "ignore" });
    const text = await new Response(proc.stdout).text();
    await proc.exited;
    return text;
  } catch {
    return "";
  }
}

export async function writeClipboard(text: string): Promise<void> {
  try {
    const proc = Bun.spawn({ cmd: copyCommand, stdin: "pipe", stdout: "ignore", stderr: "ignore" });
    proc.stdin.write(text);
    proc.stdin.end();
    await proc.exited;
  } catch {
    // silently ignore clipboard errors
  }
}
