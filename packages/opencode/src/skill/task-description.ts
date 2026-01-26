import { MessageV2 } from "../session/message-v2"
import { Provider } from "../provider/provider"
import { Config } from "../config/config"
import { generateText } from "ai"
import { Log } from "../util/log"

export namespace TaskDescription {
  const log = Log.create({ service: "skill.task-description" })

  const DEFAULT_PROMPT =
    "Based on the conversation history, describe the current task or goal in 1-2 concise sentences. " +
    "Focus on what the user is trying to accomplish."

  // Session-specific cache
  const cache = new Map<
    string,
    {
      description: string
      timestamp: number
    }
  >()

  export async function generate(messages: MessageV2.WithParts[], customPrompt?: string): Promise<string> {
    const config = await Config.get()
    const defaultModel = config.small_model ? Provider.parseModel(config.small_model) : await Provider.defaultModel()

    // Build conversation summary (last N messages)
    const recentMessages = messages
      .slice(-10) // Last 10 messages
      .map((msg) => {
        const role = msg.info.role
        const text = msg.parts
          .filter((p) => p.type === "text")
          .map((p) => p.text)
          .join("\n")
        return `${role}: ${text}`
      })
      .join("\n\n")

    const prompt = (customPrompt || DEFAULT_PROMPT).replace("{conversation}", recentMessages)

    try {
      const model = await Provider.getModel(defaultModel.providerID, defaultModel.modelID)
      const language = await Provider.getLanguage(model)

      const result = await generateText({
        model: language,
        messages: [{ role: "user", content: prompt }],
        maxOutputTokens: 100,
      })

      return result.text.trim()
    } catch (error) {
      log.error("Failed to generate task description", { error })
      return "General development task" // Fallback
    }
  }

  export async function getOrGenerate(
    sessionID: string,
    messages: MessageV2.WithParts[],
    customPrompt?: string,
  ): Promise<string> {
    const config = await Config.get()
    const ttl = config.skill_discovery?.cache_ttl ?? 300000

    const cached = cache.get(sessionID)
    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.description
    }

    const description = await generate(messages, customPrompt)
    cache.set(sessionID, { description, timestamp: Date.now() })

    return description
  }

  export function update(sessionID: string, description: string): void {
    cache.set(sessionID, { description, timestamp: Date.now() })
    log.info("Task description updated", { sessionID, description })
  }

  export function invalidate(sessionID: string): void {
    cache.delete(sessionID)
  }
}
