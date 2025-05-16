import { supabase } from "@/lib/supabase";
import { TreeNode } from "@/lib/utils";
import type { Database } from "@/types/database";
import { useQuery } from "@tanstack/react-query";

type StoryRow = Database["public"]["Tables"]["stories"]["Row"];
type SectionRow = Database["public"]["Tables"]["sections"]["Row"];
type ContentRow = Database["public"]["Tables"]["content"]["Row"];
type BlockAssignmentRow =
  Database["public"]["Tables"]["block_assignments"]["Row"];
type BlockRow = Database["public"]["Tables"]["blocks"]["Row"];

type NestedContent = ContentRow & {
  block_assignments: (BlockAssignmentRow & {
    blocks: BlockRow;
  })[];
};

type NestedSection = SectionRow & {
  content: NestedContent[];
  block_assignments: (BlockAssignmentRow & {
    blocks: BlockRow;
  })[];
};

type StoryWithTree = StoryRow & {
  sections: NestedSection[];
};

export async function fetchStoryWithBlocks(storyId: number) {
  const { data, error } = await supabase
    .from("stories")
    .select(
      `
      id,
      title,
      description,
      sections:sections!sections_story_id_fkey (
        id,
        name,
        position,
        parent_section,
        story_id,
        block_assignments:block_assignments (
          id,
          block_id,
          blocks (
            id,
            type,
            config
          )
        ),
        content:content!content_parent_section_fkey (
          id,
          name,
          position,
          parent_section,
          type,
          block_assignments:block_assignments (
            id,
            block_id,
            blocks (
              id,
              type,
              config
            )
          )
        )
      )
    `
    )
    .eq("id", storyId)
    .order("position", { referencedTable: "sections" })
    .order("position", { referencedTable: "sections.content" })
    .single();

  if (error) throw error;
  return data as StoryWithTree;
}

export function assembleStoryOutline(raw: StoryWithTree): {
  id: number;
  title: string;
  description: string | null;
  content: TreeNode[];
} {
  const nodeMap = new Map<number, TreeNode>();
  const childrenByParent = new Map<number | null, TreeNode[]>();

  raw.sections.forEach((section) => {
    const sectionNode: TreeNode = {
      id: section.id,
      name: section.name,
      type: "section",
      position: section.position,
      blocks: section.block_assignments.map((b) => b.blocks),
      children: [],
      parentId: section.parent_section,
    };

    nodeMap.set(section.id, sectionNode);

    const parentId = section.parent_section;
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
    childrenByParent.get(parentId)!.push(sectionNode);

    section.content.forEach((contentItem) => {
      const contentNode: TreeNode = {
        id: contentItem.id,
        name: contentItem.name,
        type: "content",
        position: contentItem.position,
        blocks: contentItem.block_assignments.map((b) => b.blocks),
        parentId: section.id,
      };

      sectionNode.children!.push(contentNode);
    });
  });

  for (const [parentId, children] of childrenByParent.entries()) {
    if (parentId !== null && nodeMap.has(parentId)) {
      nodeMap.get(parentId)!.children!.push(...children);
    }
  }

  const topLevel = childrenByParent.get(null) || [];

  function sort(nodes: TreeNode[]) {
    nodes.sort((a, b) => a.position - b.position);
    nodes.forEach((n) => n.children && sort(n.children));
  }

  sort(topLevel);

  return {
    id: raw.id,
    title: raw.title,
    description: raw.description,
    content: topLevel,
  };
}

export function useGetStoryOutline(storyId: number) {
  return useQuery({
    queryKey: ["storyTree", storyId],
    queryFn: async () => {
      const raw = await fetchStoryWithBlocks(storyId);
      return assembleStoryOutline(raw);
    },
    enabled: !!storyId,
  });
}
