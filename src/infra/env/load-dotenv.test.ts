import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadDotEnv } from "./load-dotenv.js";

test("loadDotEnv applies missing keys and does not override existing env", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "cdt-dotenv-"));
  const envPath = path.join(tempDir, ".env");
  const sentinel = `cdt-dotenv-${Date.now()}`;

  try {
    await writeFile(
      envPath,
      [
        "# comment",
        "STORE_BACKEND=sqlite",
        `DOTENV_TEST_SENTINEL=${sentinel}`,
        'QUOTED_VALUE="hello world"',
        "export EXPORTED_KEY=from-export"
      ].join("\n"),
      "utf8"
    );

    process.env.STORE_BACKEND = "memory";
    delete process.env.DOTENV_TEST_SENTINEL;
    delete process.env.QUOTED_VALUE;
    delete process.env.EXPORTED_KEY;

    const applied = loadDotEnv(envPath);
    assert.ok(applied >= 3);
    assert.equal(process.env.STORE_BACKEND, "memory");
    assert.equal(process.env.DOTENV_TEST_SENTINEL, sentinel);
    assert.equal(process.env.QUOTED_VALUE, "hello world");
    assert.equal(process.env.EXPORTED_KEY, "from-export");
  } finally {
    delete process.env.DOTENV_TEST_SENTINEL;
    delete process.env.QUOTED_VALUE;
    delete process.env.EXPORTED_KEY;
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("loadDotEnv returns 0 when file is missing", () => {
  assert.equal(loadDotEnv(path.join(os.tmpdir(), `missing-env-${Date.now()}.env`)), 0);
});
