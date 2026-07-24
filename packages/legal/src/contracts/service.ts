import { contractRecordsService } from "./service-contracts.js"
import { contractSeriesService } from "./service-series.js"
import {
  allocateContractNumber,
  ContractTemplateSyntaxError,
  isContractTemplateSyntaxError,
  mergeContractNumberIntoVariables,
  renderTemplate,
  validateContractTemplateBody,
  validateTemplateVariables,
} from "./service-shared.js"
import { contractTemplatesService } from "./service-templates.js"

export {
  DURABLE_CONTRACT_DOCUMENT_ATTACHMENT_KINDS,
  DurableContractDocumentAttachmentMutationError,
} from "./service-contracts.js"
export {
  allocateContractNumber,
  ContractTemplateSyntaxError,
  isContractTemplateSyntaxError,
  mergeContractNumberIntoVariables,
  renderTemplate,
  validateContractTemplateBody,
  validateTemplateVariables,
}

export const contractsService = {
  ...contractTemplatesService,
  ...contractSeriesService,
  ...contractRecordsService,
}
