import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string) {
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export type TreeNode = {
  parentId: any;
  id: number;
  name: string;
  type: "section" | "content";
  position: number;
  blocks: any[];
  children?: TreeNode[];
};

export type FlattenedNode = {
  node: TreeNode;
  parentId: number | null;
  depth: number;
  indexPath: number[];
};

export type StoryTree = {
  id: number;
  title: string;
  description: string | null;
  content: TreeNode[];
};

export function getVisibleFlatTree(
  tree: TreeNode[],
  expanded: Set<number>
): FlattenedNode[] {
  return flattenTreeWithDepth(tree, null, 0, [], expanded);
}

export function flattenTreeWithDepth(
  nodes: TreeNode[],
  parentId: number | null,
  depth: number,
  path: number[] = [],
  expanded: Set<number>
): FlattenedNode[] {
  const flat: FlattenedNode[] = [];

  nodes.forEach((node, index) => {
    const indexPath = [...path, index];
    flat.push({ node, parentId, depth, indexPath });

    const isExpanded = node.type === "section" && expanded.has(node.id);
    if (isExpanded && node.children?.length) {
      flat.push(
        ...flattenTreeWithDepth(
          node.children,
          node.id,
          depth + 1,
          indexPath,
          expanded
        )
      );
    }
  });

  return flat;
}

// rebuildTreeFromFlat
export function rebuildTreeFromFlat(flat: FlattenedNode[]): TreeNode[] {
  const map = new Map<number, TreeNode>();
  const roots: TreeNode[] = [];

  // Clone and reset children
  flat.forEach(({ node }) => {
    map.set(node.id, { ...node, children: node.children ?? [] });
  });

  flat.forEach(({ node, parentId }) => {
    const current = map.get(node.id)!;
    if (parentId == null) {
      roots.push(current);
    } else {
      const parent = map.get(parentId);
      if (parent?.children) parent.children.push(current);
    }
  });

  return roots;
}
