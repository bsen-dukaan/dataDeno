import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { stringify as csvStringify } from "https://deno.land/std@0.177.0/encoding/csv.ts";

const app = new Hono();

const BACKEND_URL = "https://apiv1.bot9.ai/api/analytics/v2";

app.get("/", (c) => {
  return c.json({ msg: "Hi This is Deno!" });
});

app.get("/api/csat-dump/:bot9ID", async (c) => {
  const bot9ID = c.req.param("bot9ID");
  const { startDate, startTime, endDate, endTime } = c.req.query();

  if (!bot9ID || !startDate || !startTime || !endDate || !endTime) {
    return c.json({ error: "Missing required query parameters." }, 400);
  }

  try {
    const response = await fetch(
      `${BACKEND_URL}/${bot9ID}/raw-chat-data?startDate=${startDate}&startTime=${startTime}&endDate=${endDate}&endTime=${endTime}`,
      {
        headers: {
          Authorization:
            "Bearer eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImU0ZTllNWZjLTRmZjEtNDI3MS04MTQwLTgxOGVhMjg0MzdmZiIsImVtYWlsIjoiYm90OXByb2RAcmVudG9tb2pvLmNvbSJ9.IReUFEuv4u7mK8t1aXeIjNSBoEyTijxC7ZKpt67nlEk",
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
          Origin: "http://localhost:3000",
          Referer: "http://localhost:3000/",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Backend responded with status: ${response.status}`);
    }

    const rawData = await response.json();

    const processedData = processChatData(rawData);

    const csv = await csvStringify(processedData, {
      columns: [
        "Chat Start Time",
        "Chat End Time",
        "UserId",
        "Tag",
        "ChatLink",
        "CSAT",
        "Handled by",
        "Source",
      ],
      cast: {
        string: (value) => value || "N/A",
        number: (value) => value || 0,
      },
    });

    c.header("Content-Type", "text/csv");
    c.header(
      "Content-Disposition",
      `attachment; filename=chat_data-${Date.now()}.csv`
    );

    return c.body(csv);
  } catch (error) {
    console.error("Error processing chat data:", error);
    return c.json({ error: "Failed to process data." }, 500);
  }
});

app.get("/api/agent-dump/:bot9ID", async (c) => {
  const bot9ID = c.req.param("bot9ID");
  const { startDate, startTime, endDate, endTime } = c.req.query();

  if (!bot9ID || !startDate || !startTime || !endDate || !endTime) {
    return c.json({ error: "Missing required query parameters." }, 400);
  }

  try {
    const response = await fetch(
      `${BACKEND_URL}/${bot9ID}/raw-agent-data?startDate=${startDate}&startTime=${startTime}&endDate=${endDate}&endTime=${endTime}`,
      {
        headers: {
          Authorization:
            "Bearer eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImU0ZTllNWZjLTRmZjEtNDI3MS04MTQwLTgxOGVhMjg0MzdmZiIsImVtYWlsIjoiYm90OXByb2RAcmVudG9tb2pvLmNvbSJ9.IReUFEuv4u7mK8t1aXeIjNSBoEyTijxC7ZKpt67nlEk",
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
          Origin: "http://localhost:3000",
          Referer: "http://localhost:3000/",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Backend responded with status: ${response.status}`);
    }

    const rawData = await response.json();

    const processedData = processAgentData(rawData);

    const csv = await csvStringify(processedData, {
      columns: [
        "Chat Start Time",
        "Chat End Time",
        "Channel",
        "UserId",
        "Tag",
        "ChatLink",
        "CSAT",
        "Feedback for",
        "City",
        "Handled by",
        "Agent Name",
        "Queue Time",
        "Handling Time / Resolution Time",
        "First Response Time",
        "Average Response time",
        "Messages sent by user",
        "Messages sent by handler",
        "Notes",
      ],
      cast: {
        string: (value) => value || "N/A",
        number: (value) => value || 0,
      },
    });

    c.header("Content-Type", "text/csv");
    c.header(
      "Content-Disposition",
      `attachment; filename=agent_dump-${Date.now()}.csv`
    );

    return c.body(csv);
  } catch (error) {
    console.error("Error processing agent dump data:", error);
    return c.json({ error: "Failed to process data." }, 500);
  }
});

function toISTString(date: Date): string {
  const istDate = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  const day = String(istDate.getUTCDate()).padStart(2, "0");
  const month = String(istDate.getUTCMonth() + 1).padStart(2, "0");
  const year = istDate.getUTCFullYear();
  let hours = istDate.getUTCHours();
  const minutes = String(istDate.getUTCMinutes()).padStart(2, "0");
  const seconds = String(istDate.getUTCSeconds()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${day}-${month}-${year}- ${hours}:${minutes}:${seconds} ${ampm}`;
}

function processChatData(rawData: any) {
  const { conversations, messages, reviews, conversationTags, tagAttributes } =
    rawData;

  const csatScores: { [key: string]: string } = {};
  reviews.forEach((review: any) => {
    csatScores[review.entityId] = review.value || "N/A";
  });

  const conversationTagsMap: { [key: string]: string[] } = {};
  conversationTags.forEach((tag: any) => {
    if (!conversationTagsMap[tag.ConversationId]) {
      conversationTagsMap[tag.ConversationId] = [];
    }
    conversationTagsMap[tag.ConversationId].push(tag.name || "N/A");
  });

  const userIdsMap: { [key: string]: string } = {};
  tagAttributes.forEach((attr: any) => {
    userIdsMap[attr.entityId] = attr.value || "N/A";
  });

  const agentHandledConversations = new Set();
  const escalateduringworkinghours = new Set();
  const escalateduringoutsideworkinghours = new Set();

  messages.forEach((message: any) => {
    if (message.meta) {
      const meta = message.meta;
      if (meta.functionCall) {
        if (
          meta.functionCall.some(
            (call: any) =>
              call.name === "AssignChatToAgent" ||
              call.name === "AutoAssignChats"
          )
        ) {
          agentHandledConversations.add(message.ConversationId);
        }
        if (
          meta.functionCall.some(
            (call: any) => call.name === "escalateduringworkinghours"
          )
        ) {
          escalateduringworkinghours.add(message.ConversationId);
        }
        if (
          meta.functionCall.some(
            (call: any) => call.name === "escalateduringoutsideworkinghours"
          )
        ) {
          escalateduringoutsideworkinghours.add(message.ConversationId);
        }
      }
    }
  });

  const latestMessageTimes = messages.reduce(
    (acc: { [key: string]: number }, message: any) => {
      const convoId = message.ConversationId;
      const messageTime = new Date(message.createdAt).getTime();
      if (!acc[convoId] || messageTime > acc[convoId]) {
        acc[convoId] = messageTime;
      }
      return acc;
    },
    {}
  );

  return conversations.map((convo: any) => {
    let handledBy = "Bot";
    if (agentHandledConversations.has(convo.id)) {
      handledBy = "Assigned to agent";
    } else if (escalateduringworkinghours.has(convo.id)) {
      handledBy = "Escalated during working hours";
    } else if (escalateduringoutsideworkinghours.has(convo.id)) {
      handledBy = "Escalated during outside working hours";
    }

    return {
      "Chat Start Time": toISTString(new Date(convo.createdAt || Date.now())),
      "Chat End Time": toISTString(
        new Date(latestMessageTimes[convo.id] || convo.createdAt || Date.now())
      ),
      UserId: userIdsMap[convo.endUserId] || "N/A",
      Tag: conversationTagsMap[convo.id]
        ? conversationTagsMap[convo.id].join(", ")
        : "N/A",
      ChatLink: `https://app.bot9.ai/inbox/${convo.id}?status=bot&search=`,
      CSAT: csatScores[convo.id] || "N/A",
      "Handled by": handledBy,
      Source: convo.Source || "N/A",
    };
  });
}

function processAgentData(rawData: any) {
  const {
    conversations,
    messages,
    reviews,
    userIdTagAttributes,
    cityTagAttributes,
    users,
    invitations,
  } = rawData;

  // Helper functions
  function formatTime(seconds: number): string {
    if (seconds === null || seconds === undefined || isNaN(seconds))
      return "N/A";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0"
    )}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  function toISTString(date: Date): string {
    const istDate = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
    const day = String(istDate.getUTCDate()).padStart(2, "0");
    const month = String(istDate.getUTCMonth() + 1).padStart(2, "0");
    const year = istDate.getUTCFullYear();
    let hours = istDate.getUTCHours();
    const minutes = String(istDate.getUTCMinutes()).padStart(2, "0");
    const seconds = String(istDate.getUTCSeconds()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${day}-${month}-${year}- ${hours}:${minutes}:${seconds} ${ampm}`;
  }

  // Create efficient data structures for lookups
  const csatScores = new Map(
    reviews.map((review: any) => [
      review.entityId,
      {
        value: review.value || "N/A",
        createdAt: new Date(review.createdAt).getTime(),
      },
    ])
  );

  const userIdsMap = new Map(
    userIdTagAttributes.map((attr: any) => [attr.entityId, attr.value || "N/A"])
  );
  const cityMap = new Map(
    cityTagAttributes.map((attr: any) => [attr.entityId, attr.value || "N/A"])
  );

  const agentNamesMap = new Map(
    invitations
      .map((invitation: any) => {
        const user = users.find((user: any) => user.email === invitation.email);
        return user ? [user.id, invitation.name || "N/A"] : null;
      })
      .filter(Boolean)
  );

  // Group messages by conversation for efficient processing
  const messagesByConversation = messages.reduce(
    (acc: Map<string, any[]>, message: any) => {
      if (!acc.has(message.ConversationId)) {
        acc.set(message.ConversationId, []);
      }
      acc.get(message.ConversationId)!.push(message);
      return acc;
    },
    new Map()
  );

  // Process each conversation
  const processedData = conversations.flatMap((convo: any) => {
    const feedback = csatScores.get(convo.id);
    const city = cityMap.get(convo.endUserId) || "N/A";
    const channel = convo.Source || "N/A";
    const convoMessages = messagesByConversation.get(convo.id) || [];

    convoMessages.sort(
      (a: any, b: any) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    let segments: any[] = [];
    let currentSegment: any = null;
    let currentHandler: string | null = null;
    let lastUserMessageTime: Date | null = null;

    for (const message of convoMessages) {
      const chatUser = message.chatUser;
      const createdAt = new Date(message.createdAt);

      let handlerType = currentHandler;

      if (chatUser === "bot") {
        handlerType = "Bot";
      } else if (chatUser === "humanagent") {
        handlerType = "Agent";
      } else if (chatUser === "system") {
        let chatText = {};
        try {
          chatText = message.chatText ? JSON.parse(message.chatText) : {};
        } catch (e) {
          // Handle invalid JSON
        }
        if (
          chatText.conversationTransfer === "needs_review" ||
          chatText.reason === "Executed AutoAssignChats Tool Call"
        ) {
          handlerType = "Agent";
        } else if (chatText.conversationTransfer === "closed") {
          if (currentSegment) {
            currentSegment.endTime = createdAt;
            segments.push(currentSegment);
            currentSegment = null;
            currentHandler = null;
          }
          continue;
        }
      } else if (chatUser === "user") {
        handlerType = currentHandler || "Bot";
        lastUserMessageTime = createdAt;
      }

      if (handlerType !== currentHandler) {
        if (currentSegment) {
          currentSegment.endTime = createdAt;
          segments.push(currentSegment);
        }
        currentSegment = {
          handler: handlerType,
          startTime: createdAt,
          endTime: null,
          userMessages: 0,
          handlerMessages: 0,
          firstResponseTime: null,
          totalResponseTime: 0,
          responseCount: 0,
          queueTime:
            handlerType === "Agent" && lastUserMessageTime
              ? createdAt.getTime() - lastUserMessageTime.getTime()
              : 0,
        };
        currentHandler = handlerType;
      }

      if (currentSegment) {
        if (chatUser === "user") {
          currentSegment.userMessages += 1;
        } else if (chatUser === "bot" || chatUser === "humanagent") {
          currentSegment.handlerMessages += 1;
          if (!currentSegment.firstResponseTime && lastUserMessageTime) {
            currentSegment.firstResponseTime =
              (createdAt.getTime() - lastUserMessageTime.getTime()) / 1000;
          }
          if (lastUserMessageTime) {
            const responseTime =
              (createdAt.getTime() - lastUserMessageTime.getTime()) / 1000;
            currentSegment.totalResponseTime += responseTime;
            currentSegment.responseCount += 1;
            lastUserMessageTime = null;
          }
        }
      }
    }

    if (currentSegment) {
      currentSegment.endTime =
        currentSegment.endTime || currentSegment.startTime;
      segments.push(currentSegment);
    }

    // Filter out unnecessary segments
    segments = segments.filter((segment) => {
      if (segment.startTime.getTime() === segment.endTime.getTime()) {
        return false;
      }
      if (segment.userMessages === 0 && segment.handlerMessages === 0) {
        return false;
      }
      if (
        segment.handler === "Bot" &&
        segment.handlerMessages === 1 &&
        segment.userMessages === 0 &&
        segments.some(
          (s) =>
            s.handler === "Agent" &&
            s.startTime.getTime() === segment.endTime.getTime()
        )
      ) {
        return false;
      }
      return true;
    });

    return segments.map((segment) => {
      const handlingTime = formatTime(
        (segment.endTime.getTime() - segment.startTime.getTime()) / 1000
      );
      const avgResponseTime =
        segment.responseCount > 0
          ? formatTime(segment.totalResponseTime / segment.responseCount)
          : "N/A";
      const firstResponseTime = segment.firstResponseTime
        ? formatTime(segment.firstResponseTime)
        : "N/A";

      let agentName = "N/A";
      if (segment.handler === "Agent") {
        agentName = agentNamesMap.get(convo.AgentId) || "N/A";
      } else if (segment.handler === "Bot") {
        agentName = "Bot9";
      }

      let queueTime = formatTime(segment.queueTime / 1000);

      let csatScore = "N/A";
      let feedbackFor = "N/A";
      if (feedback && feedback.value) {
        csatScore = feedback.value;
        if (
          feedback.createdAt >= segment.startTime.getTime() &&
          feedback.createdAt <= segment.endTime.getTime()
        ) {
          feedbackFor = segment.handler;
        }
      }

      return {
        "Chat Start Time": toISTString(segment.startTime),
        "Chat End Time": toISTString(segment.endTime),
        Channel: channel,
        UserId: userIdsMap.get(convo.endUserId) || "N/A",
        Tag:
          convo.ChatTags && convo.ChatTags.length > 0
            ? convo.ChatTags.map((tag: any) => tag.name || "N/A").join(", ")
            : "N/A",
        ChatLink: `https://app.bot9.ai/inbox/${convo.id}?status=bot&search=`,
        CSAT: csatScore,
        "Feedback for": feedbackFor,
        City: city,
        "Handled by": segment.handler || "N/A",
        "Agent Name": agentName,
        "Queue Time": queueTime,
        "Handling Time / Resolution Time": handlingTime,
        "First Response Time": firstResponseTime,
        "Average Response time": avgResponseTime,
        "Messages sent by user": segment.userMessages || 0,
        "Messages sent by handler": segment.handlerMessages || 0,
        Notes: convo.notes || "N/A",
      };
    });
  });

  return processedData;
}

export default app;
