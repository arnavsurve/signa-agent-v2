import { tool, Tool } from "ai";
import { z } from "zod";
import { ToolServices, UserContext } from "./index";

/**
 * Zod schema for analyze_network tool parameters.
 */
const analyzeNetworkSchema = z.object({
  analysis_type: z
    .enum(["influencers", "clusters"])
    .describe(
      "Type of analysis: 'influencers' for high-connection nodes, 'clusters' for related groups"
    ),
  sectors: z
    .array(z.string())
    .optional()
    .describe("Filter analysis to specific sectors"),
  locations: z
    .array(z.string())
    .optional()
    .describe("Filter analysis to specific locations"),
  limit: z
    .number()
    .default(50)
    .describe("Maximum profiles to return"),
});

/**
 * Create the analyze_network tool.
 */
export function createAnalyzeNetworkTool(
  services: ToolServices,
  _context: UserContext
): Tool {
  return tool({
    description: `Analyze network patterns and dynamics.

Analysis types:
- **influencers**: Find high-connection nodes in the network (most followed_by_count)
- **clusters**: Identify groups of related profiles based on shared connections

Use this for:
- Finding influential people in a sector
- Discovering network clusters and communities

Returns profiles with relevant metrics for the analysis type.`,

    inputSchema: analyzeNetworkSchema,

    execute: async (params) => {
      try {
        const result = await services.analyzeNetwork({
          analysisType: params.analysis_type,
          sectors: params.sectors,
          locations: params.locations,
          limit: params.limit,
        });

        return {
          analysis_type: result.analysisType,
          profiles: result.profiles,
          insights: result.insights,
          metrics: result.metrics,
          count: result.profiles.length,
        };
      } catch (error) {
        console.error("[analyze_network] Error:", error);
        return {
          error: "Network analysis failed",
          message: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });
}
