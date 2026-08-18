/**
 * Which generator commands may run at the same time, and how many at once.
 *
 * `verify:openapi-drift` and `verify:openapi-path-ownership` both drive the real
 * generators — deliberately, because a reimplementation inside a checker would
 * drift from the generator exactly the way the documents drifted from the routes.
 * The cost is therefore in *how many processes are started*, not in what they do:
 * together the two checks were spending nine minutes locally on ~71 sequential
 * `pnpm --filter <pkg> generate:openapi` runs, each paying pnpm startup plus a
 * `tsx` compile before doing any work. That put the `architecture` CI job, which
 * has a ten-minute budget, over the line (voyant#4855).
 *
 * Running them concurrently is safe only between commands that cannot write the
 * same file. Two that can must stay in order, and the reason is specific rather
 * than theoretical: both checks work by writing an artifact and reading back what
 * a generator put there. A generator usually emits *several* documents, so a
 * concurrent run of an overlapping command would rewrite the file the other one
 * is mid-probe on, and the read-back would report paths that the probe had just
 * emptied — a false pass, in the direction that matters.
 *
 * So commands are partitioned into connected components over the files they
 * write. Components run in parallel; the commands inside one run in sequence.
 */
import { availableParallelism } from "node:os"

/**
 * Commands partitioned so that no two groups write a file in common.
 *
 * @param {ReadonlyArray<{ command: string, files: ReadonlyArray<string> }>} generators
 * @returns {string[][]} each group is a list of commands that must run in sequence
 */
export function commandGroups(generators) {
  const parent = new Map()
  const find = (command) => {
    let node = command
    while (parent.get(node) !== node) {
      parent.set(node, parent.get(parent.get(node)))
      node = parent.get(node)
    }
    return node
  }
  const union = (a, b) => {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent.set(rootA, rootB)
  }

  for (const { command } of generators) {
    if (!parent.has(command)) parent.set(command, command)
  }

  const writtenBy = new Map()
  for (const { command, files } of generators) {
    for (const file of files) {
      const existing = writtenBy.get(file)
      if (existing === undefined) writtenBy.set(file, command)
      else union(existing, command)
    }
  }

  const groups = new Map()
  for (const { command } of generators) {
    const root = find(command)
    const members = groups.get(root) ?? []
    if (!members.includes(command)) members.push(command)
    groups.set(root, members)
  }
  return [...groups.values()]
}

/**
 * How many groups to run at once.
 *
 * Capped low on purpose. Each worker is a full `pnpm` + `tsx` process tree, so
 * the limit is memory and I/O rather than cores, and a CI runner with four vCPUs
 * is the machine that has to stay under the budget.
 */
export const CONCURRENCY = Math.max(1, Math.min(4, availableParallelism()))

/**
 * Run `worker` over `items`, at most `limit` at a time, preserving input order in
 * the results.
 *
 * @template T, R
 * @param {ReadonlyArray<T>} items
 * @param {(item: T, index: number) => Promise<R>} worker
 * @param {number} limit
 * @returns {Promise<R[]>}
 */
export async function inParallel(items, worker, limit = CONCURRENCY) {
  const results = new Array(items.length)
  let next = 0
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (let index = next++; index < items.length; index = next++) {
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(lanes)
  return results
}
