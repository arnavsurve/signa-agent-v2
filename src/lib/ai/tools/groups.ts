import { tool } from "ai";
import { z } from "zod";
import { ToolServices, UserContext } from "./index";

/**
 * Create the get_my_groups tool.
 */
export function createGetMyGroupsTool(
  services: ToolServices,
  context: UserContext
) {
  return tool({
    description: `Get the user's saved groups.

Groups are curated lists of people the user has organized together.
Use this to discover what groups the user has set up, then use get_group_members() to get members of a specific group.`,

    inputSchema: z.object({}),

    execute: async () => {
      try {
        const groups = await services.getUserGroups(context.userId);

        return {
          groups: groups.map((group) => ({
            id: group.id,
            name: group.name,
            description: group.description,
            member_count: group.memberCount,
            created_at: group.createdAt.toISOString(),
          })),
          count: groups.length,
        };
      } catch (error) {
        console.error("[get_my_groups] Error:", error);
        return {
          error: "Failed to get groups",
          message: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });
}

/**
 * Zod schema for get_group_members tool parameters.
 */
const getGroupMembersSchema = z.object({
  group_id: z.number().describe("ID of the group to get members from"),
});

/**
 * Create the get_group_members tool.
 */
export function createGetGroupMembersTool(
  services: ToolServices,
  context: UserContext
) {
  return tool({
    description: `Get members of a specific group.

Returns all profiles in the specified group with their current signal context.
Use get_my_groups() first to discover available groups.`,

    inputSchema: getGroupMembersSchema,

    execute: async (params) => {
      try {
        const members = await services.getGroupMembers(
          params.group_id,
          context.userId
        );

        return {
          group_id: params.group_id,
          members: members.map((member) => ({
            user_id: member.userId,
            screen_name: member.screenName,
            name: member.name,
            headline: member.headline,
          })),
          count: members.length,
        };
      } catch (error) {
        console.error("[get_group_members] Error:", error);
        return {
          error: "Failed to get group members",
          message: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });
}
