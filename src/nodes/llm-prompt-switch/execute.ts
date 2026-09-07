import { collectRecentReferenceImages } from '../../chat/referenceImages';
import type { WorkflowNode } from '../../types';
import { assemblePrompt, migrateRouter, resolveRoute } from './routerModel';
import { resolveConnectedImages } from '../shared/imageInputs';
import { llmPromptSwitchMemo } from '../runScratch';
import { promptActionConfigs, withPromptActionRuntimeSettingsList } from '../shared/promptActions';
import { promptCommandConfigs } from '../shared/promptCommands';
import { runActionAwarePrompt } from '../shared/promptRun';
import type { ExecuteContext } from '../types';

export const promptSwitchTextHandle = 'text';
export const promptSwitchOutputChannelHandle = 'output-channel';
export const promptSwitchPromptSlotHandle = 'prompt-slot';

async function resolveInput(node: WorkflowNode, context: ExecuteContext, targetHandle: string) {
  const edge = context.edges.find(
    (candidate) => candidate.target === node.id && candidate.targetHandle === targetHandle,
  );
  if (!edge) {
    const label =
      targetHandle === promptSwitchOutputChannelHandle
        ? 'Output Channel'
        : targetHandle === promptSwitchPromptSlotHandle
          ? 'Prompt Slot'
          : 'Text';
    throw new Error(`LLM Prompt Switch requires a ${label} input.`);
  }
  return context.executeInput(edge.source, edge.sourceHandle);
}

async function runPromptSwitch(node: WorkflowNode, context: ExecuteContext) {
  node = { ...node, data: structuredClone(node.data) };
  const config = migrateRouter(node.data);
  let runMetadata: Omit<NonNullable<WorkflowNode['data']['responseRouterLastRun']>, 'state' | 'error'> = {
    routeId: '', revision: config.revision, outputValue: '', promptValue: '',
  };
  try {
    if (config.policy === 'strict') {
      for (const handle of [promptSwitchTextHandle, promptSwitchOutputChannelHandle, promptSwitchPromptSlotHandle]) {
        if (context.edges.filter((edge) => edge.target === node.id && edge.targetHandle === handle).length > 1) {
          throw new Error(`Response Router has multiple sources for ${handle}.`);
        }
      }
    }
    const [inputValue, outputChannelValue, promptSlotValue] = await Promise.all([
      resolveInput(node, context, promptSwitchTextHandle),
      resolveInput(node, context, promptSwitchOutputChannelHandle),
      resolveInput(node, context, promptSwitchPromptSlotHandle),
    ]);
    runMetadata = { ...runMetadata, outputValue: outputChannelValue, promptValue: promptSlotValue };
    const { output, route, fallback } = resolveRoute(config, outputChannelValue, promptSlotValue);
    const outputChannel = output.selector;
    const promptSlot = route.selector;
    runMetadata = { ...runMetadata, routeId: route.id, selectedOutput: outputChannel, selectedPrompt: promptSlot };
    context.updateRuntimeData(node.id, { responseRouterLastRun: { ...runMetadata, state: 'running' } });
    if (output.disconnected === 'error' && !context.edges.some((edge) => edge.source === node.id && edge.sourceHandle === output.handle)) {
      throw new Error(`Output ${output.title} is not connected.`);
    }
    if (fallback) {
      context.reportWarning(
        `${node.data.label}: Legacy selector fallback selected (${outputChannel}, ${promptSlot}) from (${outputChannelValue}, ${promptSlotValue}).`,
      );
    }
    const { promptBefore, promptAfter, combinedPrompt } = assemblePrompt(route, inputValue, context.settingsValueDefinitions, context.settingsValues);
    const selectionDebug = {
      outputChannelValue,
      promptSlotValue,
      selectedOutputChannel: outputChannel,
      selectedPromptSlot: promptSlot,
    };
    if (!inputValue.trim()) {
      context.updateRuntimeData(node.id, {
        responseRouterLastRun: { ...runMetadata, state: 'skipped' },
        preview: 'Skipped: no text input',
        generatedText: '',
        fullText: '',
        displayTokenBytesPerToken: context.textMetrics.bytesPerToken,
        llmPromptSwitchDebug: {
          inputValue,
          promptBefore,
          promptAfter,
          combinedPrompt,
          generatedText: '',
          ...selectionDebug,
        },
      });
      return { outputChannel, outputHandle: output.handle, text: '' };
    }

    context.updateRuntimeData(node.id, {
      preview: fallback
        ? `Legacy fallback; calling output ${outputChannel}, prompt ${promptSlot} ...`
        : `Calling output ${outputChannel}, prompt ${promptSlot} ...`,
      llmCallStats: [],
      llmPromptSwitchDebug: { inputValue, promptBefore, promptAfter, combinedPrompt, generatedText: '', ...selectionDebug },
    });
    const images = await resolveConnectedImages(node, context);
    const referenceImages = collectRecentReferenceImages({
      messages: context.historyMessages,
      nodes: context.nodes,
      options: context.referenceImages,
    });
    runMetadata = { ...runMetadata, connectedImageCount: images.length, referenceImageCount: referenceImages.length };
    context.updateRuntimeData(node.id, { responseRouterLastRun: { ...runMetadata, state: 'running' } });
    const actionConfigs = withPromptActionRuntimeSettingsList(
      promptActionConfigs(node.data.llmPromptActions),
      context.promptActionSettings,
    );
    const streamsVisibleOutput = !!context.streamOutput && context.edges.some(
      (edge) =>
        edge.source === node.id &&
        edge.sourceHandle === output.handle &&
        edge.target === context.outputNodeId,
    );
    const outputTitle = output.title;
    const promptTitle = route.title;
    const result = await runActionAwarePrompt({
      node,
      context,
      inputValue,
      images,
      referenceImages,
      promptBefore,
      promptAfter,
      actionConfigs,
      commandConfigs: promptCommandConfigs(node.data.llmPromptCommands),
      streamsVisibleOutput,
      contributesToTokenCalibration: true,
      callLabel: (actionReplayCount) =>
        `${outputTitle} / ${promptTitle}${actionReplayCount ? ` / Action replay ${actionReplayCount}` : ''}`,
    });
    context.updateRuntimeData(node.id, {
      responseRouterLastRun: { ...runMetadata, state: 'success' },
      preview: fallback
        ? `Legacy fallback; used ${outputTitle}, ${promptTitle} via ${result.connectionLabel}`
        : `${outputTitle}, ${promptTitle} sent via ${result.connectionLabel}`,
      generatedText: result.generatedText,
      fullText: result.generatedText,
      displayTokenBytesPerToken: context.textMetrics.bytesPerToken,
      llmPromptSwitchDebug: {
        ...result.debug,
        ...selectionDebug,
      },
    });
    return { outputChannel, outputHandle: output.handle, text: result.generatedText };
  } catch (error) {
    context.updateRuntimeData(node.id, { responseRouterLastRun: {
      ...runMetadata, state: 'error', error: error instanceof Error ? error.message : String(error),
    } });
    throw error;
  }
}

export async function executeLlmPromptSwitchNode(node: WorkflowNode, context: ExecuteContext) {
  const memo = llmPromptSwitchMemo(context);
  const resultPromise = memo.get(node.id) ?? runPromptSwitch(node, context);
  memo.set(node.id, resultPromise);
  const result = await resultPromise;
  return context.sourceHandle === result.outputHandle ? result.text : '';
}
