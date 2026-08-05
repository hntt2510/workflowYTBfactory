const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const schemas = Object.fromEntries(["job", "review", "evaluation"].map((name) => [name, readJson(`.harness/schemas/${name}.schema.json`)]));
const jobsDirectory = path.join(root, ".harness", "jobs");
const candidates = walkJsonFiles(jobsDirectory).filter((file) => !file.includes(`${path.sep}examples${path.sep}`) || file.endsWith(".json"));

for (const file of candidates) validate(readJson(file), schemas.job, file);
for (const directory of [".harness/reviews", ".harness/evaluations"]) {
  for (const file of walkJsonFiles(path.join(root, directory))) validate(readJson(file), schemas[directory.endsWith("reviews") ? "review" : "evaluation"], file);
}
for (const file of ["feature_list.json", ".harness/state.json"]) readJson(file);
console.log("Harness JSON validation passed.");

function readJson(file) {
  const absolute = path.isAbsolute(file) ? file : path.join(root, file);
  return JSON.parse(fs.readFileSync(absolute, "utf8"));
}

function walkJsonFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walkJsonFiles(file) : entry.name.endsWith(".json") ? [file] : [];
  });
}

function validate(value, schema, label) {
  const fail = (message) => { throw new Error(`${label}: ${message}`); };
  if (schema.const !== undefined && value !== schema.const) fail(`must equal ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) fail(`must be one of ${schema.enum.join(", ")}`);
  if (schema.type === "object") {
    if (!value || Array.isArray(value) || typeof value !== "object") fail("must be an object");
    for (const key of schema.required ?? []) if (!(key in value)) fail(`missing required property ${key}`);
    if (schema.additionalProperties === false) for (const key of Object.keys(value)) if (!schema.properties?.[key]) fail(`unexpected property ${key}`);
    for (const [key, propertySchema] of Object.entries(schema.properties ?? {})) if (key in value) validate(value[key], propertySchema, `${label}.${key}`);
  }
  if (schema.type === "array") {
    if (!Array.isArray(value)) fail("must be an array");
    if (schema.minItems !== undefined && value.length < schema.minItems) fail(`must contain at least ${schema.minItems} items`);
    for (const item of value) validate(item, schema.items ?? {}, label);
    for (const rule of schema.allOf ?? []) if (rule.contains && !value.some((item) => matches(item, rule.contains))) fail("does not contain required value");
  }
  if (schema.type === "string") {
    if (typeof value !== "string") fail("must be a string");
    if (schema.minLength !== undefined && value.length < schema.minLength) fail(`must be at least ${schema.minLength} characters`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) fail("does not match required pattern");
  }
  if (schema.type === "integer" && (!Number.isInteger(value) || (schema.minimum !== undefined && value < schema.minimum) || (schema.maximum !== undefined && value > schema.maximum))) fail("must be an integer within the allowed range");
}

function matches(value, schema) {
  try { validate(value, schema, "contains"); return true; } catch { return false; }
}
