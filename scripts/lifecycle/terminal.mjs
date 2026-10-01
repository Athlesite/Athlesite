/**
 * Interactive line input for the founder tool, with the streams injected.
 *
 * ── WHY THIS IS ITS OWN MODULE ───────────────────────────────────────────────────
 *
 * The property worth testing here is cleanup: after Enter, after Ctrl-C, after the stream ends,
 * and after the stream errors, the terminal must be out of raw mode, the listeners must be gone,
 * and the promise must have settled. None of that is observable if the reader reaches for
 * `process.stdin` directly, so the streams are parameters.
 *
 * ── WHAT HIDING THE CODE DOES AND DOES NOT DO ────────────────────────────────────
 *
 * It keeps the emailed code off the screen and out of terminal scrollback. It cannot prevent a
 * terminal emulator, multiplexer, session recorder, or keylogger from capturing keystrokes. The
 * tool never writes credentials anywhere — that is a property of the tool, not of the terminal it
 * runs in, and the two should not be conflated.
 *
 * On a non-TTY stdin there is nothing to hide and no raw mode to set. The reader says so rather
 * than implying the input was masked.
 */

const CTRL_C = 0x03;
const BACKSPACE = 0x08;
const DELETE = 0x7f;

/**
 * Reads one line, echoing nothing.
 *
 * Resolves with the line on Enter. Rejects on Ctrl-C, on the stream ending before a line arrives,
 * and on a stream error — a partial line is never returned as though it were complete input.
 */
export function readHiddenLine(promptText, { input, output }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let rawModeEnabled = false;
    let buffer = "";

    /**
     * Idempotent teardown. Every exit path goes through it, including the ones that reject, so
     * there is no path that leaves the terminal in raw mode or the promise pending.
     */
    const cleanup = () => {
      input.removeListener("data", onData);
      input.removeListener("end", onEnd);
      input.removeListener("close", onEnd);
      input.removeListener("error", onError);
      if (rawModeEnabled) {
        rawModeEnabled = false;
        try {
          input.setRawMode(false);
        } catch {
          /* nothing useful to do if the terminal refuses to leave raw mode */
        }
      }
      if (typeof input.pause === "function") input.pause();
    };

    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    };

    function onEnd() {
      settle(reject, new Error("input stream ended before a line was entered"));
    }
    function onError(err) {
      settle(reject, err instanceof Error ? err : new Error(String(err)));
    }

    function onData(chunk) {
      for (const ch of String(chunk)) {
        if (ch === "\r" || ch === "\n") {
          output.write("\n");
          settle(resolve, buffer);
          return;
        }
        // Control characters are compared by CODE POINT, so no control byte appears in this file.
        const code = ch.charCodeAt(0);
        if (code === CTRL_C) {
          output.write("\n");
          settle(reject, new Error("interrupted"));
          return;
        }
        if (code === DELETE || code === BACKSPACE) {
          buffer = buffer.slice(0, -1);
          continue;
        }
        if (ch >= " ") buffer += ch;
      }
    }

    output.write(`  ${promptText}`);

    if (input.isTTY) {
      try {
        input.setRawMode(true);
        rawModeEnabled = true;
      } catch (err) {
        output.write("\n");
        settle(reject, err);
        return;
      }
    } else {
      output.write("\n  (stdin is not a terminal: input is NOT hidden)\n  ");
    }

    if (typeof input.setEncoding === "function") input.setEncoding("utf8");
    input.on("data", onData);
    input.on("end", onEnd);
    input.on("close", onEnd);
    input.on("error", onError);
    if (typeof input.resume === "function") input.resume();
  });
}

/**
 * Reads one visible line.
 *
 * Used for the athlete's email address. That is not a credential, but it does stay in scrollback —
 * deliberately, because the operator needs to see what they typed to catch a typo before a code is
 * sent to the wrong address.
 */
export function readVisibleLine(promptText, { input, output }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let buffered = "";

    const cleanup = () => {
      input.removeListener("data", onData);
      input.removeListener("end", onEnd);
      input.removeListener("close", onEnd);
      input.removeListener("error", onError);
      if (typeof input.pause === "function") input.pause();
    };
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    };

    function onEnd() {
      settle(reject, new Error("input stream ended before a line was entered"));
    }
    function onError(err) {
      settle(reject, err instanceof Error ? err : new Error(String(err)));
    }
    function onData(chunk) {
      buffered += String(chunk);
      const end = buffered.search(/[\r\n]/);
      if (end >= 0) settle(resolve, buffered.slice(0, end));
    }

    output.write(`  ${promptText}`);
    if (typeof input.setEncoding === "function") input.setEncoding("utf8");
    input.on("data", onData);
    input.on("end", onEnd);
    input.on("close", onEnd);
    input.on("error", onError);
    if (typeof input.resume === "function") input.resume();
  });
}
