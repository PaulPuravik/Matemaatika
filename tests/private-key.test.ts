// The private key is copied by hand out of a JSON file into a dashboard field,
// so it arrives mangled in several predictable ways. Every one of them has to
// end up as a PEM that OpenSSL accepts.
import { createPrivateKey } from "node:crypto";
import { execSync } from "node:child_process";
import { normalizePrivateKey } from "../src/lib/pem.ts";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  cond ? pass++ : fail++;
  console.log((cond ? "PASS  " : "FAIL  ") + label);
};

const real = execSync(
  "openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 2>/dev/null",
).toString();

const accepts = (value: string) => {
  try {
    createPrivateKey(normalizePrivateKey(value)!);
    return true;
  } catch {
    return false;
  }
};

check("plain PEM with real newlines", accepts(real));
check("escaped \\n, as JSON stores it", accepts(real.replace(/\n/g, "\\n")));
check("escaped \\n wrapped in double quotes", accepts('"' + real.replace(/\n/g, "\\n") + '"'));
check("escaped \\n wrapped in single quotes", accepts("'" + real.replace(/\n/g, "\\n") + "'"));
check("real newlines wrapped in quotes", accepts('"' + real + '"'));
check("windows line endings", accepts(real.replace(/\n/g, "\r\n")));
check("escaped \\r\\n", accepts(real.replace(/\n/g, "\\r\\n")));
check("leading and trailing whitespace", accepts("  \n" + real + "  \n"));
check("no trailing newline", accepts(real.trimEnd()));

check("undefined stays undefined", normalizePrivateKey(undefined) === undefined);
check("empty string stays falsy", !normalizePrivateKey(""));
check("garbage is not accepted", accepts("see ei ole võti") === false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
