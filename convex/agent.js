import { action } from "./_generated/server";
import { v } from "convex/values";

// Convex Action to call the external ElevenLabs API and get a signed conversation URL
export const getSessionUrl = action({
  args: {
    userId: v.optional(v.string()),
    userName: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const agentId = process.env.ELEVENLABS_AGENT_ID;
    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (!agentId) {
      throw new Error("ELEVENLABS_AGENT_ID environment variable is missing on Convex.");
    }
    if (!apiKey) {
      throw new Error("ELEVENLABS_API_KEY environment variable is missing on Convex.");
    }

    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            dynamic_variables: {
              userId: args.userId || "anonymous_user",
              userName: args.userName || "Customer"
            }
          })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs API returned status ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      return {
        success: true,
        signedUrl: data.signed_url
      };
    } catch (error) {
      console.error("ElevenLabs getSessionUrl failed:", error);
      return {
        success: false,
        error: error.message
      };
    }
  }
});

// Helper utility to verify ElevenLabs webhook secrets from incoming HTTP request headers
export const verifyAgentSecret = (headers) => {
  const secretHeader = headers.get("x-elevenlabs-secret") || headers.get("authorization");
  const expectedSecret = process.env.ELEVENLABS_WEBHOOK_SECRET;

  // If secret is not set in development, bypass security checks
  if (!expectedSecret || expectedSecret === "dummy_webhook_secret") {
    return true;
  }

  return secretHeader === expectedSecret || secretHeader === `Bearer ${expectedSecret}`;
};
