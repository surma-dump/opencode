import path from "path"
import z from "zod"
import { Tool } from "./tool"
import { Skill } from "../skill"
import { ConfigMarkdown } from "../config/markdown"
import { PermissionNext } from "../permission/next"

export const SkillTool = Tool.define("skill", async (ctx) => {
  const skills = await Skill.all(ctx?.sessionID)

  // Filter skills by agent permissions if agent provided
  const agent = ctx?.agent
  const accessibleSkills = agent
    ? skills.filter((skill) => {
        const rule = PermissionNext.evaluate("skill", skill.name, agent.permission)
        return rule.action !== "deny"
      })
    : skills

  const description =
    accessibleSkills.length === 0
      ? "Load a skill to get detailed instructions for a specific task. No skills are currently available."
      : [
          "Load a skill to get detailed instructions for a specific task.",
          "Skills provide specialized knowledge and step-by-step guidance.",
          "Use this when a task matches an available skill's description.",
          "Only the skills listed here are available:",
          "<available_skills>",
          ...accessibleSkills.flatMap((skill) => [
            `  <skill>`,
            `    <name>${skill.name}</name>`,
            `    <description>${skill.description}</description>`,
            `  </skill>`,
          ]),
          "</available_skills>",
        ].join(" ")

  const examples = accessibleSkills
    .map((skill) => `'${skill.name}'`)
    .slice(0, 3)
    .join(", ")
  const hint = examples.length > 0 ? ` (e.g., ${examples}, ...)` : ""

  const parameters = z.object({
    name: z.string().describe(`The skill identifier from available_skills${hint}`),
  })

  return {
    description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const skill = await Skill.get(params.name, ctx.sessionID)

      if (!skill) {
        const available = await Skill.all(ctx.sessionID).then((x) => x.map((s) => s.name).join(", "))
        throw new Error(`Skill "${params.name}" not found. Available skills: ${available || "none"}`)
      }

      await ctx.ask({
        permission: "skill",
        patterns: [params.name],
        always: [params.name],
        metadata: {},
      })

      // Load skill content
      let content: string
      if (skill.content) {
        // Inline content from HTTP API
        content = skill.content
      } else {
        // Load from filesystem
        const parsed = await ConfigMarkdown.parse(skill.location)
        content = parsed.content.trim()
      }

      const dir =
        skill.location.startsWith("http://") || skill.location.startsWith("https://")
          ? "N/A (remote skill)"
          : path.dirname(skill.location)

      // Format output similar to plugin pattern
      const output = [`## Skill: ${skill.name}`, "", `**Base directory**: ${dir}`, "", content].join("\n")

      return {
        title: `Loaded skill: ${skill.name}`,
        output,
        metadata: {
          name: skill.name,
          dir,
        },
      }
    },
  }
})
