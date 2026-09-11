import * as preprocessor from "../src/preprocessor.js";

preprocessor.validate_preprocessor_output("use docker");
preprocessor.parse_preprocessor_output("use docker");

// Shared cross-language snake_case exports no longer accept the removed
// source_input parameter from the synced Python public API contract fixture.
// @ts-expect-error shared contract removed source_input from validate_preprocessor_output
preprocessor.validate_preprocessor_output("use docker", "use docker");

// @ts-expect-error shared contract removed source_input from parse_preprocessor_output
preprocessor.parse_preprocessor_output("use docker", "use docker");
