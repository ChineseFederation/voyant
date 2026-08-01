import fs from "node:fs"
import path from "node:path"
import ts from "typescript"

const WORKSPACE_PARENTS = ["packages", "packages/plugins", "apps", "examples"]
const EMIT_ONLY_COMPILER_OPTIONS = new Set([
  "composite",
  "configFilePath",
  "declaration",
  "declarationDir",
  "declarationMap",
  "emitBOM",
  "emitDeclarationOnly",
  "incremental",
  "inlineSourceMap",
  "inlineSources",
  "listEmittedFiles",
  "mapRoot",
  "newLine",
  "noEmit",
  "noEmitHelpers",
  "noEmitOnError",
  "outDir",
  "outFile",
  "removeComments",
  "rootDir",
  "sourceMap",
  "sourceRoot",
  "stripInternal",
  "tsBuildInfoFile",
])

export function discoverWorkspaceManifests(rootDirectory) {
  const manifests = []

  for (const parent of WORKSPACE_PARENTS) {
    const absoluteParent = path.join(rootDirectory, parent)
    if (!fs.existsSync(absoluteParent)) continue

    for (const entry of fs.readdirSync(absoluteParent, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const directory = path.join(absoluteParent, entry.name)
      const manifestPath = path.join(directory, "package.json")
      if (!fs.existsSync(manifestPath)) continue

      manifests.push({
        directory,
        manifestPath,
        manifest: JSON.parse(fs.readFileSync(manifestPath, "utf8")),
      })
    }
  }

  return manifests.sort((left, right) => left.manifest.name.localeCompare(right.manifest.name))
}

export function classifyTypecheck({ directory, manifest }) {
  const typecheckCommand = manifest.scripts?.typecheck
  if (!typecheckCommand) {
    return { required: false, reason: "no-typecheck-task" }
  }

  const buildCommand = manifest.scripts?.build
  if (!buildCommand) {
    return { required: true, reason: "no-build-task" }
  }

  const buildProjects = extractTypeScriptProjects(buildCommand, directory)
  if (buildProjects.length === 0) {
    return { required: true, reason: "build-does-not-typecheck" }
  }
  if (buildCommand.includes("--noCheck")) {
    return { required: true, reason: "build-disables-typechecking" }
  }

  const typecheckProjects = extractTypeScriptProjects(typecheckCommand, directory)
  if (typecheckProjects.length !== 1 || buildProjects.length !== 1) {
    return { required: true, reason: "multi-project-typecheck" }
  }

  const buildProject = readProject(buildProjects[0])
  const typecheckProject = readProject(typecheckProjects[0])
  const uncoveredFiles = [...typecheckProject.files].filter((file) => !buildProject.files.has(file))

  if (uncoveredFiles.length > 0) {
    return {
      required: true,
      reason: "typecheck-covers-additional-files",
      uncoveredFiles,
    }
  }

  if (
    canonicalJson(buildProject.semanticOptions) !== canonicalJson(typecheckProject.semanticOptions)
  ) {
    return { required: true, reason: "typecheck-uses-different-options" }
  }

  return { required: false, reason: "build-covers-typecheck" }
}

function extractTypeScriptProjects(command, directory) {
  const invocations = command.match(/\btsc\b[^;&|]*/g) ?? []

  return invocations.map((invocation) => {
    const projectMatch = invocation.match(/(?:--project|-p)(?:=|\s+)(?:["']([^"']+)["']|([^\s]+))/)
    return path.resolve(directory, projectMatch?.[1] ?? projectMatch?.[2] ?? "tsconfig.json")
  })
}

function readProject(configPath) {
  const config = ts.readConfigFile(configPath, ts.sys.readFile)
  if (config.error) {
    throw new Error(formatDiagnostics([config.error]))
  }

  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    path.dirname(configPath),
    undefined,
    configPath,
  )
  if (parsed.errors.length > 0) {
    throw new Error(formatDiagnostics(parsed.errors))
  }

  return {
    files: new Set(parsed.fileNames.map((file) => path.resolve(file))),
    semanticOptions: Object.fromEntries(
      Object.entries(parsed.options).filter(([key]) => !EMIT_ONLY_COMPILER_OPTIONS.has(key)),
    ),
  }
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value))
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  )
}

function formatDiagnostics(diagnostics) {
  return ts.formatDiagnostics(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => "\n",
  })
}
