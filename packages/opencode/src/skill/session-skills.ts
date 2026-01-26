import { Skill } from "./skill"
import { Config } from "../config/config"
import { TaskDescription } from "./task-description"
import { MessageV2 } from "../session/message-v2"
import { Log } from "../util/log"
import { ConfigMarkdown } from "../config/markdown"

export namespace SessionSkills {
  const log = Log.create({ service: "skill.session" })

  // Session-specific skill cache
  const sessionCache = new Map<
    string,
    {
      skills: Record<string, Skill.Info>
      taskDescription: string
      timestamp: number
    }
  >()

  async function discoverViaHTTP(
    taskDescription: string,
    config: NonNullable<Config.Info["skill_discovery"]>,
  ): Promise<Record<string, Skill.Info>> {
    const headers = { "Content-Type": "application/json", ...config.headers }

    try {
      const response = await fetch(config.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ task: taskDescription }),
        signal: AbortSignal.timeout(config.timeout ?? 5000),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      // Expected format: { skills: [...] }
      if (!Array.isArray(data.skills)) {
        throw new Error("Invalid response: 'skills' must be an array")
      }

      const skills: Record<string, Skill.Info> = {}

      // Handle inline skill content
      for (const skillData of data.skills) {
        if (typeof skillData === "object" && skillData.name) {
          // Inline format: { name, description, content }
          skills[skillData.name] = {
            name: skillData.name,
            description: skillData.description,
            location: `http://${config.endpoint}#${skillData.name}`, // Virtual location
            content: skillData.content, // Store content directly
          }
        } else if (typeof skillData === "string") {
          // File path format: "/path/to/skill/SKILL.md"
          const parsed = await ConfigMarkdown.parse(skillData).catch((err) => {
            log.error("Failed to load skill from path", { path: skillData, err })
            return undefined
          })

          if (parsed) {
            const skillInfo = Skill.Info.pick({ name: true, description: true }).safeParse(parsed.data)
            if (skillInfo.success) {
              skills[skillInfo.data.name] = {
                ...skillInfo.data,
                location: skillData,
              }
            }
          }
        }
      }

      log.info("Discovered skills via HTTP", {
        count: Object.keys(skills).length,
        names: Object.keys(skills),
        task: taskDescription,
      })

      return skills
    } catch (error) {
      log.error("HTTP skill discovery failed", { error, endpoint: config.endpoint })
      throw error
    }
  }

  export async function ensure(sessionID: string, messages: MessageV2.WithParts[]): Promise<void> {
    const config = await Config.get()

    if (!config.skill_discovery?.enabled) {
      return // Use global filesystem-based skills
    }

    const cached = sessionCache.get(sessionID)
    const ttl = config.skill_discovery.cache_ttl ?? 300000

    // Check cache validity
    if (cached && Date.now() - cached.timestamp < ttl) {
      log.debug("Using cached session skills", { sessionID })
      return
    }

    try {
      // Generate task description
      const taskDescription = await TaskDescription.getOrGenerate(
        sessionID,
        messages,
        config.skill_discovery.description_prompt,
      )

      // Discover skills via HTTP
      const skills = await discoverViaHTTP(taskDescription, config.skill_discovery)

      // Cache results
      sessionCache.set(sessionID, {
        skills,
        taskDescription,
        timestamp: Date.now(),
      })

      log.info("Session skills discovered", {
        sessionID,
        count: Object.keys(skills).length,
      })
    } catch (error) {
      if (config.skill_discovery.fallback_to_filesystem) {
        log.warn("Falling back to filesystem skill discovery", { error })
        return // Will use global skills
      }

      // Set empty skills to indicate error (no fallback)
      sessionCache.set(sessionID, {
        skills: {},
        taskDescription: "",
        timestamp: Date.now(),
      })

      log.error("Skill discovery failed, no skills available", { sessionID, error })
    }
  }

  export async function get(sessionID: string): Promise<Record<string, Skill.Info> | undefined> {
    return sessionCache.get(sessionID)?.skills
  }

  export function invalidate(sessionID: string): void {
    sessionCache.delete(sessionID)
    TaskDescription.invalidate(sessionID)
  }
}
