import { z } from 'zod';

/**
 * Schemas for the static template library under `src/api/assets/templates`.
 *
 * Every template is authored as `<slug>/template.json`. Unknown keys are
 * stripped by zod, which is deliberate: `workflow.nodes[].credentials` never
 * reaches the API response even if someone adds it to the source file.
 */

const templateCategorySchema = z.object({
  /** Required by n8n's ITemplatesCategory contract and category deep links. */
  id: z.number().int(),
  name: z.string().min(1),
});

const templateImageSchema = z.object({
  id: z.number().int(),
  url: z.string().min(1),
});

/** Display descriptor: one entry per distinct node *type*, used to render card icons. */
const templateNodeDescriptorSchema = z.object({
  /** Required by n8n's ITemplatesNode contract. */
  id: z.number().int(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  icon: z.string().optional(),
  iconData: z
    .object({
      type: z.string().min(1),
      icon: z.string().optional(),
      fileBuffer: z.string().optional(),
    })
    .optional(),
  defaults: z.record(z.string(), z.unknown()).optional(),
  typeVersion: z.union([z.number(), z.array(z.number())]).optional(),
  group: z.string().optional(),
  categories: z.array(templateCategorySchema).optional(),
  nodeCategories: z.array(templateCategorySchema).optional(),
});

/**
 * One node instance in the importable graph.
 *
 * Loose on purpose: node settings such as `onError`, `retryOnFail` or `notes`
 * are passed through untouched, so a template file stays close to a real n8n
 * export. `credentials` is the one thing stripped, because templates are
 * public content and credentials are always re-attached by the user.
 */
const templateWorkflowNodeBaseSchema = z.looseObject({
  name: z.string().min(1),
  type: z.string().min(1),
  position: z.tuple([z.number(), z.number()]),
  parameters: z.record(z.string(), z.unknown()).default({}),
  typeVersion: z.union([z.number(), z.array(z.number())]).optional(),
  id: z.string().optional(),
  webhookId: z.string().optional(),
  disabled: z.boolean().optional(),
});

export type TemplateWorkflowNode = z.infer<typeof templateWorkflowNodeBaseSchema>;

const templateWorkflowNodeSchema = templateWorkflowNodeBaseSchema.transform((node) => {
  const sanitized: Record<string, unknown> = { ...node };
  delete sanitized.credentials;
  return sanitized as TemplateWorkflowNode;
});

const templateWorkflowGraphSchema = z.object({
  nodes: z.array(templateWorkflowNodeSchema),
  connections: z.record(z.string(), z.unknown()),
  settings: z.record(z.string(), z.unknown()).optional(),
  // Deliberately no pinData: pinned executions can contain private production
  // payloads and must not be published through the unauthenticated API.
  meta: z.record(z.string(), z.unknown()).optional(),
});

export const templateRecordSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  description: z.string().default(''),
  createdAt: z.string().min(1),
  totalViews: z.number().int().nonnegative().default(0),
  /** Curation order for the default (unsorted) search result. */
  rank: z.number().optional(),
  user: z.object({
    username: z.string().min(1),
    name: z.string().default(''),
    avatar: z.string().default(''),
    verified: z.boolean().default(false),
  }),
  categories: z.array(templateCategorySchema).default([]),
  image: z.array(templateImageSchema).default([]),
  nodes: z.array(templateNodeDescriptorSchema).default([]),
  workflow: templateWorkflowGraphSchema,
});

export const collectionRecordSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  description: z.string().default(''),
  createdAt: z.string().min(1),
  totalViews: z.number().int().nonnegative().default(0),
  rank: z.number().optional(),
  workflowIds: z.array(z.number().int().positive()).default([]),
  categories: z.array(templateCategorySchema).default([]),
  nodes: z.array(templateNodeDescriptorSchema).default([]),
  image: z.array(templateImageSchema).default([]),
});

export const collectionsFileSchema = z.object({
  collections: z.array(collectionRecordSchema).default([]),
});

export type TemplateCategory = z.infer<typeof templateCategorySchema>;
export type TemplateImage = z.infer<typeof templateImageSchema>;
export type TemplateNodeDescriptor = z.infer<typeof templateNodeDescriptorSchema>;
export type TemplateWorkflowGraph = z.infer<typeof templateWorkflowGraphSchema>;
export type TemplateRecord = z.infer<typeof templateRecordSchema>;
export type TemplateCollection = z.infer<typeof collectionRecordSchema>;
