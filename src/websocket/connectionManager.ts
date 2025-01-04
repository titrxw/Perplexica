import { WebSocketServer } from 'ws';
import { handleMessage } from './messageHandler';
import {
  getAvailableEmbeddingModelProviders,
  getAvailableChatModelProviders,
} from '../lib/providers';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Embeddings } from '@langchain/core/embeddings';
import type { IncomingMessage } from 'http';
import logger from '../utils/logger';
import { ChatOpenAI } from '@langchain/openai';

export const handleUpgrade = async (request: IncomingMessage, socket: any, head: Buffer) => {
  let llm: BaseChatModel | undefined;
  let embeddings: Embeddings | undefined;
  try {
    const searchParams = new URL(request.url, `http://${request.headers.host}`)
        .searchParams;

    const [chatModelProviders, embeddingModelProviders] = await Promise.all([
      getAvailableChatModelProviders(),
      getAvailableEmbeddingModelProviders(),
    ]);

    const chatModelProvider =
        searchParams.get('chatModelProvider') ||
        Object.keys(chatModelProviders)[0];
    const chatModel =
        searchParams.get('chatModel') ||
        Object.keys(chatModelProviders[chatModelProvider])[0];

    const embeddingModelProvider =
        searchParams.get('embeddingModelProvider') ||
        Object.keys(embeddingModelProviders)[0];
    const embeddingModel =
        searchParams.get('embeddingModel') ||
        Object.keys(embeddingModelProviders[embeddingModelProvider])[0];


    if (
        chatModelProviders[chatModelProvider] &&
        chatModelProviders[chatModelProvider][chatModel] &&
        chatModelProvider != 'custom_openai'
    ) {
      llm = chatModelProviders[chatModelProvider][chatModel]
          .model as unknown as BaseChatModel | undefined;
    } else if (chatModelProvider == 'custom_openai') {
      llm = new ChatOpenAI({
        modelName: chatModel,
        openAIApiKey: searchParams.get('openAIApiKey'),
        temperature: 0.7,
        configuration: {
          baseURL: searchParams.get('openAIBaseURL'),
        },
      }) as unknown as BaseChatModel;
    }

    if (
        embeddingModelProviders[embeddingModelProvider] &&
        embeddingModelProviders[embeddingModelProvider][embeddingModel]
    ) {
      embeddings = embeddingModelProviders[embeddingModelProvider][
          embeddingModel
          ].model as Embeddings | undefined;
    }

    if (!llm || !embeddings) {
      throw new Error("Invalid LLM or embeddings model selected, please refresh the page and try again.")
    }
  } catch (err) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    logger.error(err);
  }

  // 创建 WebSocket 连接
  const wss = new WebSocketServer({ noServer: true });
  wss.handleUpgrade(request, socket, head, function (ws) {
      const interval = setInterval(() => {
        if (ws.readyState === ws.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'signal',
              data: 'open',
            }),
          );
          clearInterval(interval);
        }
      }, 5);
      wss.emit('connection', ws, request);

      ws.on(
        'message',
        async (message) =>
          await handleMessage(message.toString(), ws, llm, embeddings),
      );

      ws.on('close', () => logger.debug('Connection closed'));
  });
};
