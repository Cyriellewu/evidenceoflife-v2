import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { text, currentDate, currentTime, conversationHistory, todayEvents } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are a smart assistant for "Evidence of Life" (生活证据), a daily life tracking app.

You have TWO modes:
1. **INPUT MODE**: When the user is recording events, tasks, or habits → classify and extract structured data
2. **QUERY MODE**: When the user asks questions about their day or requests modifications to previous items → answer directly

## INPUT MODE
Classify user input as:
- "recap" (recording something that happened)
- "plan" (something to do today) 
- "due" (longer-term task/deadline/habit)

Extract:
- Clean title (REMOVE all time/date expressions and filler words like 嗯、啊、ne、那个、就是、然后)
- Tags (1-3, lowercase English)
- Time info (start_time HH:mm, duration_minutes, time_segment)
- Due date (ISO format) if applicable
- is_habit: true ONLY for explicitly recurring tasks with words like 每天, weekly, 每周, daily, 每次, etc. Do NOT set is_habit=true just because something sounds routine. Deadlines, exams, one-time events are NOT habits.
- original_text: preserve the raw input but remove filler words (嗯、啊、ne、那个、就是、然后呢、呃、好的、对)
- emoji if applicable

Classification rules:
- Past tense / completed activities → "recap"
- Short-term tasks for today → "plan"  
- Deadlines, exams, appointments with future dates → "due" (NOT habit unless explicitly recurring)
- is_habit=true ONLY when user explicitly mentions repetition keywords (每天, daily, weekly, 每周, etc.)
- If ambiguous → default to "recap"
- REMOVE time expressions from title but keep core meaning
- When the title and original_text are very similar (within 30% length), set original_text to empty string

## QUERY MODE
If the user asks a question or requests a modification:
- "今天工作了多长时间" → calculate from today's events and answer
- "总结一下我的上午/今天" → summarize based on events
- "上一个事件加上时间 几点到几点" → modify the last item
- "改一下刚才那个" → modify the previously created item

For queries, use the "query_response" tool.
For modifications to previous items, use the "modify_item" tool.

## CONTEXT
You have access to:
- Conversation history (previous inputs and results in this session)
- Today's events list (if provided)

Use this context to understand follow-up messages like "给上一个加时间" or "总结一下今天".`;

    // Build messages with conversation history
    const messages: { role: string; content: string }[] = [
      { role: "system", content: systemPrompt },
    ];

    // Add conversation history for context
    if (conversationHistory && conversationHistory.length > 0) {
      for (const entry of conversationHistory.slice(-6)) { // Last 6 exchanges max
        messages.push({ role: "user", content: entry.userText });
        if (entry.result) {
          messages.push({ role: "assistant", content: `[Previously classified: type=${entry.result.type}, title="${entry.result.title}"${entry.result.start_time ? `, time=${entry.result.start_time}` : ''}${entry.result.duration_minutes ? `, duration=${entry.result.duration_minutes}min` : ''}]` });
        }
      }
    }

    // Build the current user message with context
    let userMessage = `Today is ${currentDate}. Current time is ${currentTime || 'unknown'}.`;
    if (todayEvents && todayEvents.length > 0) {
      userMessage += `\n\nToday's events so far:\n${todayEvents.map((e: any) => `- ${e.time} ${e.title}${e.duration ? ` (${e.duration})` : ''}`).join('\n')}`;
    }
    userMessage += `\n\nUser says: "${text}"`;
    messages.push({ role: "user", content: userMessage });

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
        tools: [
          {
            type: "function",
            function: {
              name: "classify_input",
              description: "Classify user input as recap, plan, or due and extract metadata",
              parameters: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["recap", "plan", "due"] },
                  title: { type: "string", description: "Cleaned-up title with time/date removed" },
                  original_text: { type: "string", description: "Original unedited user input" },
                  tags: { type: "array", items: { type: "string" } },
                  emoji: { type: "string" },
                  time_segment: { type: "string", enum: ["morning", "afternoon", "evening", "anytime"] },
                  start_time: { type: "string", description: "Start time HH:mm" },
                  end_time: { type: "string", description: "End time HH:mm if mentioned" },
                  start_offset_minutes: { type: "number" },
                  duration_minutes: { type: "number" },
                  start_pomodoro: { type: "boolean" },
                  due_date: { type: "string", description: "YYYY-MM-DDTHH:mm" },
                  is_habit: { type: "boolean" },
                },
                required: ["type", "title", "tags"],
                additionalProperties: false,
              },
            },
          },
          {
            type: "function",
            function: {
              name: "query_response",
              description: "Answer a user question about their day, provide summaries, or respond to conversational queries",
              parameters: {
                type: "object",
                properties: {
                  answer: { type: "string", description: "Natural language answer to the user's question" },
                  summary_type: { type: "string", enum: ["morning", "afternoon", "evening", "full_day", "work", "custom"], description: "Type of summary if applicable" },
                },
                required: ["answer"],
                additionalProperties: false,
              },
            },
          },
          {
            type: "function",
            function: {
              name: "modify_item",
              description: "Modify a previously created item in the conversation (e.g. add time, change title)",
              parameters: {
                type: "object",
                properties: {
                  target: { type: "string", enum: ["last", "specific"], description: "Which item to modify" },
                  target_title: { type: "string", description: "Title of item to modify if specific" },
                  updates: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      start_time: { type: "string", description: "HH:mm" },
                      end_time: { type: "string", description: "HH:mm" },
                      duration_minutes: { type: "number" },
                      tags: { type: "array", items: { type: "string" } },
                    },
                    additionalProperties: false,
                  },
                },
                required: ["target", "updates"],
                additionalProperties: false,
              },
            },
          },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      // Fallback: if no tool call, check for plain text response
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        return new Response(JSON.stringify({ _action: "query", answer: content }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("No tool call in response");
    }

    const result = JSON.parse(toolCall.function.arguments);
    
    // Tag the result with the action type
    if (toolCall.function.name === "query_response") {
      result._action = "query";
    } else if (toolCall.function.name === "modify_item") {
      result._action = "modify";
    } else {
      result._action = "classify";
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("smart-input error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
