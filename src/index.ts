export interface ScaffoldInfo {
  packageName: string;
  status: "scaffold";
  version: string;
}

export function getScaffoldInfo(): ScaffoldInfo {
  return {
    packageName: "@rlippmann/context-compiler-directive-drafter",
    status: "scaffold",
    version: "0.1.0"
  };
}
