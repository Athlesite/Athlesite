/**
 * Cleanup behaviour of the interactive readers.
 *
 * The thing worth testing is not that a line comes back — it is that every exit path leaves the
 * terminal usable and the promise settled. A reader that returns the right string but leaves stdin
 * in raw mode with listeners attached breaks the next prompt, and a reader that never settles hangs
 * the tool where the operator can do nothing but kill it.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { readHiddenLine, readVisibleLine } from "./terminal.mjs";

/** A stdin stand-in that records raw-mode changes, like a real TTY would accept. */
function fakeTty({ isTTY = true, rawModeThrows = false } = {}) {
  const stream = new PassThrough();
  stream.isTTY = isTTY;
  stream.rawModeCalls = [];
  stream.setRawMode = (value) => {
    stream.rawModeCalls.push(value);
    if (rawModeThrows) throw new Error("raw mode unavailable");
    stream.rawModeEnabled = value;
    return stream;
  };
  stream.rawModeEnabled = false;
  return stream;
}

function fakeOut() {
  const written = [];
  return { written, write: (s) => written.push(String(s)) };
}

/** Listener counts that matter; a leak shows up here. */
function listenerTotals(stream) {
  return ["data", "end", "close", "error"].reduce((n, event) => n + stream.listenerCount(event), 0);
}

describe("readHiddenLine — success", () => {
  test("resolves with the typed line on Enter, and echoes nothing of it", async () => {
    const input = fakeTty();
    const output = fakeOut();
    const promise = readHiddenLine("Code: ", { input, output });
    input.write("12345678\r");
    assert.equal(await promise, "12345678");
    assert.ok(!output.written.join("").includes("12345678"), "the code must never be echoed");
  });

  test("leaves raw mode and removes every listener after success", async () => {
    const input = fakeTty();
    const output = fakeOut();
    const promise = readHiddenLine("Code: ", { input, output });
    input.write("abc\n");
    await promise;
    assert.deepEqual(input.rawModeCalls, [true, false], "raw mode must be entered and then left");
    assert.equal(input.rawModeEnabled, false);
    assert.equal(listenerTotals(input), 0, "no listener may survive the read");
  });

  test("backspace edits the buffer rather than being stored", async () => {
    const input = fakeTty();
    const promise = readHiddenLine("Code: ", { input, output: fakeOut() });
    input.write("12X");
    input.write(String.fromCharCode(0x7f));
    input.write("3\r");
    assert.equal(await promise, "123");
  });

  test("control bytes are discarded, not buffered", async () => {
    const input = fakeTty();
    const promise = readHiddenLine("Code: ", { input, output: fakeOut() });
    input.write(`1${String.fromCharCode(0x1b)}2\r`);
    assert.equal(await promise, "12");
  });
});

describe("readHiddenLine — termination paths", () => {
  test("Ctrl-C rejects and restores the terminal", async () => {
    const input = fakeTty();
    const output = fakeOut();
    const promise = readHiddenLine("Code: ", { input, output });
    input.write(String.fromCharCode(0x03));
    await assert.rejects(promise, /interrupted/);
    assert.deepEqual(input.rawModeCalls, [true, false]);
    assert.equal(listenerTotals(input), 0);
  });

  test("stream END settles the promise instead of hanging, and does not return a partial line", async () => {
    const input = fakeTty();
    const promise = readHiddenLine("Code: ", { input, output: fakeOut() });
    input.write("partial");
    input.end();
    await assert.rejects(promise, /input stream ended/);
    assert.deepEqual(input.rawModeCalls, [true, false]);
    assert.equal(listenerTotals(input), 0);
  });

  test("stream ERROR settles the promise and restores the terminal", async () => {
    const input = fakeTty();
    const promise = readHiddenLine("Code: ", { input, output: fakeOut() });
    input.emit("error", new Error("device detached"));
    await assert.rejects(promise, /device detached/);
    assert.deepEqual(input.rawModeCalls, [true, false]);
    assert.equal(listenerTotals(input), 0);
  });

  test("a non-Error emitted on the stream still rejects with an Error", async () => {
    const input = fakeTty();
    const promise = readHiddenLine("Code: ", { input, output: fakeOut() });
    input.emit("error", "just a string");
    await assert.rejects(promise, /just a string/);
  });

  test("a terminal that refuses raw mode rejects without attaching listeners", async () => {
    const input = fakeTty({ rawModeThrows: true });
    const promise = readHiddenLine("Code: ", { input, output: fakeOut() });
    await assert.rejects(promise, /raw mode unavailable/);
    assert.equal(listenerTotals(input), 0);
  });

  test("only the FIRST outcome settles the promise, and later input is ignored", async () => {
    // After Enter the reader has detached, so anything that follows on the stream must neither
    // change the resolved value nor reach a settled promise a second time.
    const input = fakeTty();
    const promise = readHiddenLine("Code: ", { input, output: fakeOut() });
    input.write("ok\r");
    const value = await promise;
    assert.equal(value, "ok");

    input.write("more-typing\r");
    input.end();
    await new Promise((r) => setImmediate(r));
    assert.equal(await promise, "ok", "the promise keeps its first outcome");
    assert.equal(listenerTotals(input), 0, "the reader must not have re-attached");
  });
});

describe("readHiddenLine — non-TTY stdin", () => {
  test("says the input is NOT hidden rather than implying it was masked", async () => {
    const input = fakeTty({ isTTY: false });
    const output = fakeOut();
    const promise = readHiddenLine("Code: ", { input, output });
    input.write("piped-value\n");
    assert.equal(await promise, "piped-value");
    assert.match(output.written.join(""), /NOT hidden/);
    assert.deepEqual(input.rawModeCalls, [], "raw mode is never touched on a non-TTY");
  });

  test("still settles on end", async () => {
    const input = fakeTty({ isTTY: false });
    const promise = readHiddenLine("Code: ", { input, output: fakeOut() });
    input.end();
    await assert.rejects(promise, /input stream ended/);
    assert.equal(listenerTotals(input), 0);
  });
});

describe("readVisibleLine", () => {
  test("returns the line and cleans up", async () => {
    const input = fakeTty({ isTTY: false });
    const promise = readVisibleLine("Email: ", { input, output: fakeOut() });
    input.write("someone@example.test\n");
    assert.equal(await promise, "someone@example.test");
    assert.equal(listenerTotals(input), 0);
  });

  test("settles on end and on error", async () => {
    const a = fakeTty({ isTTY: false });
    const endPromise = readVisibleLine("Email: ", { input: a, output: fakeOut() });
    a.end();
    await assert.rejects(endPromise, /input stream ended/);

    const b = fakeTty({ isTTY: false });
    const errPromise = readVisibleLine("Email: ", { input: b, output: fakeOut() });
    b.emit("error", new Error("pipe broke"));
    await assert.rejects(errPromise, /pipe broke/);
    assert.equal(listenerTotals(b), 0);
  });
});
