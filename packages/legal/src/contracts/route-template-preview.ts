import type { Context } from "hono"

import { bookingContractAcceptanceContentDigest } from "../contract-acceptance.js"
import { contractsService } from "./service.js"
import { isContractTemplateSyntaxError, type RenderTemplateInput } from "./service-shared.js"

function contractTemplateSyntaxResponse(c: Context, error: unknown) {
  if (!isContractTemplateSyntaxError(error)) {
    throw error
  }

  return c.json(
    {
      error: error.message,
      issues: error.issues,
    },
    400,
  )
}

export function renderPreviewResponse(
  c: Context,
  input: RenderTemplateInput,
  extraData: Record<string, unknown> = {},
) {
  try {
    const rendered = contractsService.renderPreview(input)
    return c.json({ data: { ...extraData, rendered } })
  } catch (error) {
    return contractTemplateSyntaxResponse(c, error)
  }
}

export async function renderAcceptancePreviewResponse(
  c: Context,
  input: RenderTemplateInput,
  template: {
    id: string
    slug: string
    name: string
    language: string
    scope: string
    currentVersionId: string
  },
) {
  try {
    const rendered = contractsService.renderPreview(input)
    const contentDigest = await bookingContractAcceptanceContentDigest({
      templateId: template.id,
      templateVersionId: template.currentVersionId,
      renderedBody: rendered,
    })
    return c.json({
      data: {
        template: {
          id: template.id,
          slug: template.slug,
          name: template.name,
          language: template.language,
          scope: template.scope,
          versionId: template.currentVersionId,
        },
        acceptance: {
          templateId: template.id,
          templateVersionId: template.currentVersionId,
          contentDigest,
        },
        rendered,
      },
    })
  } catch (error) {
    return contractTemplateSyntaxResponse(c, error)
  }
}
