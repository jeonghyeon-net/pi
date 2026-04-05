import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Type } from "@sinclair/typebox";
import { createParameterSchema, type JsonSchemaProp, mapPropertyType } from "../core/schema.js";

interface SchemaWithKind {
  [key: symbol]: unknown;
  type?: string;
  description?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  items?: unknown;
  anyOf?: unknown[];
  additionalProperties?: boolean;
}

function kind(schema: unknown): string | undefined {
  const sym = Object.getOwnPropertySymbols(schema as object).find(
    (s) => s.description === "TypeBox.Kind",
  );
  if (!sym) return undefined;
  return (schema as Record<symbol, string>)[sym];
}

describe("mapPropertyType", () => {
  it("maps string type", () => {
    const schema = mapPropertyType({ type: "string" }) as unknown as SchemaWithKind;
    assert.equal(kind(schema), "String");
    assert.equal(schema.type, "string");
  });

  it("maps string with description", () => {
    const schema = mapPropertyType({
      type: "string",
      description: "my field",
    }) as unknown as SchemaWithKind;
    assert.equal(kind(schema), "String");
    assert.equal(schema.description, "my field");
  });

  it("maps string enum (all strings) to Union of Literals", () => {
    const schema = mapPropertyType({
      type: "string",
      enum: ["a", "b", "c"],
    }) as unknown as SchemaWithKind;
    assert.equal(kind(schema), "Union");
    assert.equal(schema.anyOf?.length, 3);
    const literals = (schema.anyOf as SchemaWithKind[]).map((item) => kind(item));
    assert.deepEqual(literals, ["Literal", "Literal", "Literal"]);
  });

  it("string enum containing non-string falls back to plain String", () => {
    const schema = mapPropertyType({
      type: "string",
      enum: ["a", 123 as unknown as string],
    }) as unknown as SchemaWithKind;
    assert.equal(kind(schema), "String");
  });

  it("string enum that is not an array falls back to String", () => {
    const schema = mapPropertyType({
      type: "string",
      enum: "not-an-array" as unknown as unknown[],
    }) as unknown as SchemaWithKind;
    assert.equal(kind(schema), "String");
  });

  it("string enum with description is preserved on union", () => {
    const schema = mapPropertyType({
      type: "string",
      description: "choose one",
      enum: ["x", "y"],
    }) as unknown as SchemaWithKind;
    assert.equal(kind(schema), "Union");
    assert.equal(schema.description, "choose one");
  });

  it("maps boolean type", () => {
    const schema = mapPropertyType({ type: "boolean" }) as unknown as SchemaWithKind;
    assert.equal(kind(schema), "Boolean");
  });

  it("maps number type", () => {
    const schema = mapPropertyType({ type: "number" }) as unknown as SchemaWithKind;
    assert.equal(kind(schema), "Number");
  });

  it("maps integer type", () => {
    const schema = mapPropertyType({ type: "integer" }) as unknown as SchemaWithKind;
    assert.equal(kind(schema), "Integer");
  });

  it("maps array type to Array of Any", () => {
    const schema = mapPropertyType({ type: "array" }) as unknown as SchemaWithKind;
    assert.equal(kind(schema), "Array");
    assert.equal(kind(schema.items), "Any");
  });

  it("maps unknown type to Any", () => {
    const schema = mapPropertyType({ type: "unknown-type" }) as unknown as SchemaWithKind;
    assert.equal(kind(schema), "Any");
  });

  it("maps missing type to Any", () => {
    const schema = mapPropertyType({} as JsonSchemaProp) as unknown as SchemaWithKind;
    assert.equal(kind(schema), "Any");
  });

  it("does not set description if not a string", () => {
    const schema = mapPropertyType({
      type: "number",
      description: 42 as unknown as string,
    }) as unknown as SchemaWithKind;
    assert.equal(schema.description, undefined);
  });
});

describe("createParameterSchema", () => {
  it("returns empty Object schema for non-object type", () => {
    const schema = createParameterSchema({ type: "string" }) as unknown as SchemaWithKind;
    assert.equal(kind(schema), "Object");
    assert.deepEqual(schema.properties, {});
  });

  it("returns empty Object schema when no properties", () => {
    const schema = createParameterSchema({ type: "object" }) as unknown as SchemaWithKind;
    assert.equal(kind(schema), "Object");
    assert.deepEqual(schema.properties, {});
  });

  it("returns empty Object schema for empty input", () => {
    const schema = createParameterSchema({}) as unknown as SchemaWithKind;
    assert.equal(kind(schema), "Object");
  });

  it("converts properties with required", () => {
    const schema = createParameterSchema({
      type: "object",
      properties: {
        name: { type: "string" },
        count: { type: "number" },
      },
      required: ["name"],
    }) as unknown as SchemaWithKind;
    assert.equal(kind(schema), "Object");
    assert.equal(schema.additionalProperties, true);
    assert.deepEqual(schema.required, ["name"]);
    assert.equal(kind((schema.properties as Record<string, unknown>).name), "String");
    assert.equal(kind((schema.properties as Record<string, unknown>).count), "Number");
  });

  it("handles missing required array (treats all as optional)", () => {
    const schema = createParameterSchema({
      type: "object",
      properties: {
        foo: { type: "string" },
      },
    }) as unknown as SchemaWithKind;
    // Optional properties are not listed in required
    assert.equal(schema.required, undefined);
  });

  it("marks unrequired properties as Optional", () => {
    const schema = createParameterSchema({
      type: "object",
      properties: {
        a: { type: "string" },
        b: { type: "string" },
      },
      required: ["a"],
    }) as unknown as SchemaWithKind;
    assert.deepEqual(schema.required, ["a"]);
    // b should not be required (optional)
  });

  it("passes through a TypeBox type for sanity", () => {
    // Make sure we can still call it with Type output shape
    const obj = Type.Object({ x: Type.String() });
    // createParameterSchema expects Record<string, unknown>; Type outputs extra symbol keys,
    // but here we feed it our own shape.
    const schema = createParameterSchema(obj as unknown as Record<string, unknown>);
    assert.ok(schema);
  });
});
