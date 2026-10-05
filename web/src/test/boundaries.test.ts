import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Architecture guards (§7.5, §9). ESLint enforces the first one too, but a
 * test fails CI even if someone disables the lint rule.
 */

const SRC = path.resolve(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe("core/ is pure", () => {
  const files = walk(path.join(SRC, "core")).filter((f) => !f.endsWith(".test.ts"));

  it("has files", () => expect(files.length).toBeGreaterThan(5));

  it("imports nothing from outside core/ except libphonenumber-js", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
      for (const imp of imports) {
        const ok = imp.startsWith("./") || imp === "libphonenumber-js";
        expect(ok, `${path.relative(SRC, f)} imports ${imp}`).toBe(true);
      }
    }
  });

  it("never touches I/O, the DOM, React, or env", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, path.relative(SRC, f)).not.toMatch(/\bfetch\(|process\.env|from "react"|supabase|twilio|next\//i);
    }
  });
});

describe("service-role key never reaches the client (§9)", () => {
  const files = walk(SRC);

  it("the key is not NEXT_PUBLIC_ anywhere, including .env.example", () => {
    const envExample = readFileSync(path.resolve(SRC, "..", ".env.example"), "utf8");
    expect(envExample).not.toMatch(/NEXT_PUBLIC_SUPABASE_SERVICE_ROLE/);
    expect(envExample).toMatch(/^SUPABASE_SERVICE_ROLE_KEY=/m);
    for (const f of files.filter((f) => !f.endsWith(".test.ts"))) {
      expect(readFileSync(f, "utf8"), path.relative(SRC, f)).not.toMatch(/NEXT_PUBLIC_SUPABASE_SERVICE_ROLE/);
    }
  });

  it("is read in exactly one module — the token-scope chokepoint", () => {
    const readers = files.filter((f) => /SUPABASE_SERVICE_ROLE_KEY/.test(readFileSync(f, "utf8")) && !f.endsWith(".test.ts"));
    expect(readers.map((f) => path.relative(SRC, f).replace(/\\/g, "/"))).toEqual(["db/token-scope/client.ts"]);
  });

  it("the chokepoint and every module that imports it is server-only", () => {
    const serverOnlyModules = files.filter((f) => /^import "server-only";?/m.test(readFileSync(f, "utf8")));
    const chokepoint = path.join(SRC, "db", "token-scope", "client.ts");
    expect(serverOnlyModules).toContain(chokepoint);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      if (/from "@\/db\/token-scope\/client"/.test(src)) {
        const isClientComponent = /^"use client";?/m.test(src);
        expect(isClientComponent, `${path.relative(SRC, f)} is a client component importing the service-role client`).toBe(false);
      }
    }
  });
});
