import z from "zod"
import { Tool } from "./tool"
import { TaskDescription } from "../skill/task-description"
import { SessionSkills } from "../skill/session-skills"
import { Skill } from "../skill"

export const UpdateSkillContextTool = Tool.define("update_skill_context", {
  description: [
    "Update the task description used for discovering relevant skills.",
    "Use this when you realize the task has changed significantly or you need different skills.",
    "This will trigger re-discovery of skills from the configured HTTP endpoint.",
  ].join(" "),
  parameters: z.object({
    description: z.string().describe("A concise 1-2 sentence description of the current or updated task"),
  }),
  async execute(params, ctx) {
    // Update task description
    TaskDescription.update(ctx.sessionID, params.description)

    // Invalidate skill cache
    SessionSkills.invalidate(ctx.sessionID)

    // Re-discover skills
    await SessionSkills.ensure(ctx.sessionID, ctx.messages)

    const newSkills = await SessionSkills.get(ctx.sessionID)
    const skillNames = newSkills ? Object.keys(newSkills) : []

    return {
      title: "Updated skill discovery context",
      output: [
        `✓ Task description updated: "${params.description}"`,
        "",
        `Discovered ${skillNames.length} relevant skills:`,
        ...skillNames.map((name) => `- ${name}`),
      ].join("\n"),
      metadata: {
        description: params.description,
        skills: skillNames,
      },
    }
  },
})
