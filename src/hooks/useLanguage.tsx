import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useProfile } from '@/hooks/useProfile';

type Lang = 'zh' | 'en';

const translations: Record<string, Record<Lang, string>> = {
  // Primary nav
  'nav.today': { zh: '今日', en: 'Today' },
  'nav.calendar': { zh: '日历', en: 'Calendar' },
  'nav.recap': { zh: '回顾', en: 'Recap' },
  'nav.dues': { zh: 'Dues', en: 'Dues' },
  'nav.places': { zh: '地点', en: 'Places' },
  'nav.notes': { zh: '便签', en: 'Notes' },
  'nav.links': { zh: 'Links', en: 'Links' },
  'nav.profile': { zh: '我的', en: 'Me' },
  // Today modes
  'mode.plan': { zh: '计划', en: 'Plan' },
  'mode.recap': { zh: '回顾', en: 'Recap' },
  'mode.timeline': { zh: '时间线', en: 'Timeline' },
  'mode.viewTimeline': { zh: '今日整体 Timeline', en: "Today's Full Timeline" },
  // TodayView
  'today.leftToday': { zh: '今日剩余', en: 'Remaining' },
  'today.hoursPassed': { zh: '今日已过', en: 'Elapsed' },
  'today.timeRecorded': { zh: '时间已记录', en: 'time recorded' },
  'today.doneToday': { zh: '今日完成', en: 'Done today' },
  'today.whatYouDid': { zh: '你做了什么', en: 'What you did' },
  'today.noTasks': { zh: '还没有完成任务', en: 'No tasks completed yet' },
  'today.placeholder': { zh: '你刚刚做了什么？', en: 'What did you do just now?' },
  'today.listening': { zh: '正在听...', en: 'Listening...' },
  'today.add': { zh: '添加', en: 'Add' },
  'today.addTime': { zh: '+ 添加时间', en: '+ add time' },
  'today.remainPrefix': { zh: '还剩', en: '' },
  'today.onlyToGo': { zh: '件', en: ' to go' },
  'today.thingsDone': { zh: '件已完成', en: ' done' },
  'profile.time': { zh: '时间', en: 'Time' },
  // Plan
  'plan.list': { zh: '📋 列表', en: '📋 List' },
  'plan.timeline': { zh: '📊 时间线', en: '📊 Timeline' },
  'plan.hours': { zh: '小时', en: 'hours' },
  'plan.selected': { zh: '已选', en: 'Selected' },
  'plan.minutes': { zh: '分钟', en: 'min' },
  'plan.inputPlaceholder': { zh: '输入名称，回车添加', en: 'Type name and press Enter' },
  'plan.dot.inputPlaceholder': { zh: '输入名称，回车添加', en: 'Type name and press Enter' },
  'plan.tasks': { zh: '任务', en: 'Tasks' },
  'plan.deadlinesHabits': { zh: 'Dues & 习惯', en: 'Deadlines & Habits' },
  'plan.addTask': { zh: '添加任务...', en: 'Add a task...' },
  'plan.timeSlot': { zh: '时间段', en: 'Time slot' },
  'plan.setReminder': { zh: '设置提醒', en: 'Set Reminder' },
  'plan.repeatDaily': { zh: '每天重复', en: 'Repeat daily' },
  'plan.stopRepeatDaily': { zh: '停止每天重复', en: 'Stop repeating daily' },
  'plan.dailyBadge': { zh: '每天', en: 'Daily' },
  'plan.dailyBadgeHint': { zh: '每天重复 · 再长按取消', en: 'Repeats daily · long-press again to stop' },
  'plan.repeatDailyOn': { zh: '已设为每天重复·明天起自动出现', en: 'Set to repeat daily · appears automatically from tomorrow' },
  'plan.repeatDailyOff': { zh: '已停止每天重复', en: 'Stopped repeating daily' },
  'plan.addAndStart': { zh: '添加并开始计时', en: 'Add & start timer' },
  'plan.grouped': { zh: '分组', en: 'Grouped' },
  'plan.flat': { zh: '列表', en: 'Flat' },
  'plan.done': { zh: '已完成', en: 'Done' },
  'plan.seg.anytime': { zh: '随时', en: 'Anytime' },
  'plan.seg.morning': { zh: '早晨', en: 'Morning' },
  'plan.seg.afternoon': { zh: '下午', en: 'Afternoon' },
  'plan.seg.evening': { zh: '晚间', en: 'Evening' },
  'plan.fullTimeline': { zh: '今日整体 Timeline >', en: "Today's Full Timeline >" },
  'plan.dragHere': { zh: '拖拽任务到这里', en: 'Drag tasks here' },
  'plan.timerStartedAt': { zh: '计时开始于', en: 'Timer started at' },
  'plan.resumeTimer': { zh: '继续计时', en: 'Resume timer' },
  'plan.resetTimer': { zh: '重新开始计时', en: 'Reset timer' },
  // Focus timer — "Continue later" = end this phase (save segment, task stays open)
  'focus.endPhase': { zh: '阶段性结束', en: 'End this phase' },
  'focus.endPhaseHint': {
    zh: '保存本段专注并结束本轮；任务未完成，可再点计时开启新一轮。',
    en: 'Save this block and close the timer. Still open — tap the timer anytime to resume a fresh stretch.',
  },
  'focus.recordProgress': { zh: '记录进度', en: 'Record' },
  'focus.recordProgressHint': {
    zh: '把当前进度记在任务上并结束本轮；之后可从列表或时间线接着计时。',
    en: 'Save this progress on the task and close the timer. Resume anytime from the list or timeline.',
  },
  'focus.completeTask': { zh: '完成任务', en: 'Complete' },
  'focus.overlayContinuing': { zh: '继续计时', en: 'Resume' },
  'focus.overlayFocusing': { zh: '专注中', en: 'Focusing' },
  'focus.resumeChip': { zh: '可继续计时', en: 'Tap to resume' },
  'plan.resumeHere': { zh: '从此继续', en: 'Resume here' },
  'plan.startFocusTimer': { zh: '开始专注计时', en: 'Start focus timer' },
  'profile.title': { zh: '个人设置', en: 'Profile Settings' },
  'profile.displayName': { zh: '显示名称', en: 'Display Name' },
  'profile.wakeTime': { zh: '起床时间', en: 'Wake Time' },
  'profile.bedtime': { zh: '睡觉时间', en: 'Bedtime' },
  'profile.homepageImage': { zh: '首页图片', en: 'Homepage Image' },
  'profile.changeImage': { zh: '更换图片', en: 'Change Image' },
  'profile.language': { zh: '语言', en: 'Language' },
  'profile.signOut': { zh: '退出登录', en: 'Sign Out' },
  'profile.save': { zh: '保存', en: 'Save' },
  'profile.journey': { zh: '你的生活', en: 'Your Life' },
  'profile.journeyDesc': { zh: '记录你走过的每一天', en: 'Evidence of Life' },
  'profile.days': { zh: '记录天数', en: 'Days Recorded' },
  'profile.moments': { zh: '活动瞬间', en: 'Moments' },
  'profile.places': { zh: '去过地点', en: 'Places' },
  'profile.tasksDone': { zh: '记录事件', en: 'Events' },
  'profile.memory': { zh: '回忆', en: 'Memory' },
  'profile.memoryDesc': { zh: '来自你的生活记录', en: 'From your life records' },
  // Quick tags
  'tag.hangout': { zh: '聚会', en: 'Hangout' },
  'tag.dineOut': { zh: '外食', en: 'Dine out' },
  'tag.cook': { zh: '做饭', en: 'Cook' },
  'tag.groceries': { zh: '买菜', en: 'Groceries' },
  'tag.walk': { zh: '散步', en: 'Walk' },
  'tag.coffee': { zh: '咖啡', en: 'Coffee' },
  'tag.movie': { zh: '电影', en: 'Movie' },
  'today.noMoments': { zh: '还没有记录', en: 'No moments yet' },
  // Dues
  'dues.title': { zh: 'Dues & 习惯', en: 'Deadlines & Habits' },
  'dues.subtitle': { zh: '追踪 dues、习惯并积累进度', en: 'Track deadlines, habits & accumulate progress' },
  'dues.deadlinePlaceholder': { zh: '什么事要到期？', en: "What's due?" },
  'dues.habitPlaceholder': { zh: '新习惯或项目...', en: 'New habit or project...' },
  'dues.deadline': { zh: '📅 Due', en: '📅 Deadline' },
  'dues.habit': { zh: '🔄 习惯', en: '🔄 Habit' },
  'dues.deadlines': { zh: 'Dues', en: 'Deadlines' },
  'dues.habits': { zh: '习惯', en: 'Habits' },
  'dues.completed': { zh: '已完成', en: 'Completed' },
  'dues.markDone': { zh: '标记完成', en: 'Mark done' },
  'dues.completedLabel': { zh: '已完成', en: 'Completed' },
  'dues.addToToday': { zh: '添加到今天', en: 'Add to today' },
  'dues.addedToToday': { zh: '已添加到今天', en: 'Added to today' },
  'dues.add': { zh: '添加', en: 'Add' },
  'dues.addLink': { zh: '添加链接', en: 'Add link' },
  'dues.addPhoto': { zh: '添加图片', en: 'Add photo' },
  'dues.addDeadline': { zh: '添加期限', en: 'Add deadline' },
  'dues.remove': { zh: '移除', en: 'Remove' },
  'dues.progress': { zh: '进度', en: 'Progress' },
  'dues.punchCard': { zh: '打卡记录', en: 'Punch card' },
  'dues.empty': { zh: '还没有项目，添加期限或习惯', en: 'No items yet. Add a deadline or habit.' },
  'dues.completed_count': { zh: '已完成', en: 'completed' },
  'dues.total': { zh: '总计', en: 'total' },
  'dues.overdue': { zh: '已逾期', en: 'overdue' },
  'dues.left': { zh: '剩余', en: 'left' },
  'dues.habitProject': { zh: '习惯 / 项目', en: 'Habit / Project' },
  'dues.photo': { zh: '照片', en: 'Photo' },
  'dues.link': { zh: '链接', en: 'Link' },
  'dues.labelOptional': { zh: '名称 (可选)', en: 'Label (optional)' },
  'dues.addBtn': { zh: '添加', en: 'Add' },
  'dues.todayUrgent': { zh: '今日 / 紧急', en: 'Today / Urgent' },
  'dues.upcoming': { zh: '即将到来', en: 'Upcoming' },
  'dues.voiceListening': { zh: '正在听...', en: 'Listening...' },
  'dues.addStep': { zh: '+ 添加步骤', en: '+ Add step' },
  'dues.steps': { zh: '步骤', en: 'Steps' },
  'chatbot.confirmAdd': { zh: '确认添加', en: 'Confirm' },
  'chatbot.confirmAll': { zh: '全部确认', en: 'Confirm all' },
  'chatbot.continue': { zh: '继续说', en: 'Continue' },
  'chatbot.analyzing': { zh: 'AI 分析中...', en: 'Analyzing...' },
  'chatbot.listening': { zh: '正在聆听，请开始说话...', en: 'Listening, start speaking...' },
  'chatbot.collapseDetail': { zh: '收起详情', en: 'Hide detail' },
  'chatbot.expandDetail': { zh: '查看详情', en: 'View detail' },
  'chatbot.noDeadline': { zh: '无截止日期', en: 'No deadline' },
  'chatbot.setDeadline': { zh: '设置截止日期', en: 'Set deadline' },
  'chatbot.oneTime': { zh: '一次性', en: 'One-time' },
  'chatbot.habit': { zh: '习惯', en: 'Habit' },
  'chatbot.title': { zh: '语音输入', en: 'Voice input' },
  'chatbot.startListening': { zh: '开始语音输入', en: 'Start voice input' },
  'chatbot.stopListening': { zh: '停止聆听', en: 'Stop listening' },
  'dues.days': { zh: '天', en: 'days' },
  // Plan Drift
  'drift.title': { zh: '计划偏移', en: 'Plan Drift' },
  'drift.completed': { zh: '已完成', en: 'completed' },
  'drift.missed': { zh: '未完成', en: 'Missed' },
  'drift.overtime': { zh: '超时', en: 'Overtime' },
  'drift.unplanned': { zh: '计划外', en: 'Unplanned' },
  'drift.task': { zh: '个任务', en: 'task' },
  'drift.tasks': { zh: '个任务', en: 'tasks' },
  'drift.event': { zh: '个事件', en: 'event' },
  'drift.events': { zh: '个事件', en: 'events' },
  'drift.plan': { zh: '计划', en: 'plan' },
  'drift.actual': { zh: '实际', en: 'actual' },
  'drift.execPlanned': { zh: '计划', en: 'Planned' },
  'drift.execFocused': { zh: '专注', en: 'Focused' },
  'drift.execParallel': { zh: '本段多任务重叠；柱高为墙钟并集（未重复计时）', en: 'Overlapping tasks in this window — bar uses merged wall time (no double count).' },
  'drift.execSliceEmpty': { zh: '本段暂无任务明细', en: 'No task detail in this slice' },
  // Plan view
  'plan.comingUp': { zh: '即将到来', en: 'Coming up' },
  'plan.scheduled': { zh: '已排期', en: 'scheduled' },
  'plan.now': { zh: '现在', en: 'now' },
  'plan.timelineName': { zh: '时间线', en: 'Timeline' },
  // Chatbot
  'chatbot.typePlaceholder': { zh: '输入文字...', en: 'Type here...' },
  // Notes / Sticky
  'notes.header': { zh: '便签', en: 'Notes' },
  'notes.reminder': { zh: '随手记', en: 'Reminders' },
  'notes.freeTime': { zh: '闲来做', en: "When I'm Free" },
  'notes.reminderSub': { zh: '随时记，不急', en: 'Jot it down, no rush' },
  'notes.freeTimeSub': { zh: '闲下来可以做的', en: 'Things to do when free' },
  'notes.notePlaceholder.reminder': { zh: '便签标题，如"国内要买的"', en: 'Note title, e.g. "Books to read"' },
  'notes.notePlaceholder.freeTime': { zh: '便签标题，如"想看的电影"', en: 'Note title, e.g. "Movies to watch"' },
  'notes.addItem': { zh: '添加项目...', en: 'Add item...' },
  'notes.empty': { zh: '还没有便签，新建一个吧', en: 'No notes yet — create one above' },
  'notes.confirmDelete': { zh: '删除?', en: 'Delete?' },
  // Map view
  'map.allPlaces': { zh: '所有地点', en: 'All Places' },
  'map.food': { zh: '美食', en: 'Food' },
  'map.coffee': { zh: '咖啡', en: 'Coffee' },
  'map.outdoors': { zh: '户外', en: 'Outdoors' },
  'map.culture': { zh: '文化', en: 'Culture' },
  'map.all': { zh: '全部', en: 'All' },
  'map.places': { zh: '地点', en: 'Places' },
  'map.noPlaces': { zh: '还没有地点', en: 'No places yet' },
  'map.noPlacesHint': { zh: '给你的瞬间添加位置信息', en: 'Add locations to your moments' },
  'map.visit': { zh: '次到访', en: 'visit' },
  'map.visits': { zh: '次到访', en: 'visits' },
  'map.photo': { zh: '张照片', en: 'photo' },
  'map.photos': { zh: '张照片', en: 'photos' },
  'map.noPhotosYet': { zh: '暂无照片', en: 'No photos yet' },
  // Recap time
  'recap.setTime': { zh: '设置时间', en: 'Set time' },
  'recap.startTime': { zh: '开始', en: 'Start' },
  'recap.endTime': { zh: '结束', en: 'End' },
  'recap.missed': { zh: '未完成', en: 'Missed' },
  'recap.timeline': { zh: '时间线', en: 'Timeline' },
  'recap.moments': { zh: '个瞬间', en: 'moments' },
  'recap.moment': { zh: '个瞬间', en: 'moment' },
  'recap.lifeReplay': { zh: '生活回放', en: 'Life Replay' },
  'recap.generate': { zh: '生成', en: 'Generate' },
  'recap.generateFailed': { zh: '生成失败', en: 'Could not generate story' },
  'recap.morning': { zh: '上午', en: 'Morning' },
  'recap.afternoon': { zh: '下午', en: 'Afternoon' },
  'recap.evening': { zh: '晚上', en: 'Evening' },
  'recap.night': { zh: '深夜', en: 'Night' },
  'recap.detail': { zh: '详情', en: 'detail' },
  'recap.hideDetail': { zh: '收起详情', en: 'Hide detail' },
  'recap.viewDetail': { zh: '查看详情', en: 'View detail' },
  // Profile custom tags
  'profile.planTags': { zh: '计划标签', en: 'Plan Tags' },
  'profile.recapTags': { zh: '回顾标签', en: 'Recap Tags' },
  'profile.emojiOptions': { zh: 'Emoji 选项', en: 'Emoji Options' },
  'profile.addPlanTag': { zh: '添加 Plan 标签...', en: 'Add plan tag...' },
  'profile.addRecapTag': { zh: '添加 Recap 标签...', en: 'Add recap tag...' },
  'profile.pasteEmoji': { zh: '粘贴 emoji...', en: 'Paste emoji...' },
  // Plan tags (defaults)
  'ptag.gym': { zh: '健身', en: 'Gym' },
  'ptag.library': { zh: '图书馆', en: 'Library' },
  'ptag.hw': { zh: '作业', en: 'HW' },
  'ptag.wellness': { zh: '养生', en: 'Wellness' },
  'ptag.meeting': { zh: '会议', en: 'Meeting' },
  'ptag.errands': { zh: '跑腿', en: 'Errands' },
  'ptag.study': { zh: '学习', en: 'Study' },
  // Focus recap prompt (capture trigger after a focus session ends)
  'focusRecap.titleDone': { zh: '完成了一次专注', en: 'Focus session done' },
  'focusRecap.titleSaved': { zh: '这段时间已留下', en: 'That time is saved' },
  'focusRecap.summary': { zh: '你在「{task}」上专注了 {duration}。', en: 'You focused {duration} on "{task}".' },
  'focusRecap.moodQuestion': { zh: '感觉如何？', en: 'How did it feel?' },
  'focusRecap.noteQuestion': { zh: '做成了什么？（可选）', en: 'What got done? (optional)' },
  'focusRecap.notePlaceholder': { zh: '一句话，留个证据', en: 'One line of evidence' },
  'focusRecap.skip': { zh: '跳过', en: 'Skip' },
  'focusRecap.save': { zh: '留下证据', en: 'Keep evidence' },
  'focusRecap.saved': { zh: '已留下今天的证据', en: 'Evidence kept' },
  // End-of-day Evidence Review
  'review.title': { zh: '今天的证据', en: "Today's evidence" },
  'review.empty': { zh: '今天还没有证据，记录一个瞬间或开始专注。', en: 'No evidence yet. Log a moment or start a focus session.' },
  'review.tasksDone': { zh: '完成', en: 'done' },
  'review.focusMin': { zh: '专注分钟', en: 'focus min' },
  'review.moments': { zh: '瞬间', en: 'moments' },
  'review.photos': { zh: '照片', en: 'photos' },
  'review.places': { zh: '地点', en: 'places' },
  'review.links': { zh: '链接', en: 'links' },
  'review.question': { zh: '今天什么值得留下？', en: 'What made today worth keeping?' },
  'review.placeholder': { zh: '一句话就好', en: 'One line is enough' },
  'review.save': { zh: '留住这一天', en: 'Keep this day' },
  'review.savedToast': { zh: '已留住今天', en: 'Today is kept' },
  // On This Day / Life Replay — proactively surfaces a past day
  'onThisDay.title': { zh: '那年今天', en: 'On this day' },
  'onThisDay.oneYearAgo': { zh: '一年前', en: 'One year ago' },
  'onThisDay.yearsAgo': { zh: '{n} 年前', en: '{n} years ago' },
  'onThisDay.lastMonth': { zh: '上个月今天', en: 'Last month' },
  'onThisDay.daysAgo': { zh: '{n} 天前', en: '{n} days ago' },
  'onThisDay.revisit': { zh: '重温这一天', en: 'Revisit this day' },
  'onThisDay.noText': { zh: '一段被留下的瞬间', en: 'A moment you kept' },
  // Weekly Evidence Digest — Progress Principle, no streak pressure
  'weekly.title': { zh: '这一周', en: 'This week' },
  'weekly.activeDays': { zh: '记录天数', en: 'days recorded' },
  'weekly.focusMin': { zh: '专注分钟', en: 'focus min' },
  'weekly.moments': { zh: '瞬间', en: 'moments' },
  'weekly.photos': { zh: '照片', en: 'photos' },
  'weekly.places': { zh: '地点', en: 'places' },
  'weekly.kept': { zh: '本周留住的', en: 'Kept this week' },
  // Memory Horizons — zoom the Revisit loop out across week / month / year
  'horizon.title': { zh: '回看', en: 'Revisit' },
  'horizon.week': { zh: '周', en: 'Week' },
  'horizon.month': { zh: '月', en: 'Month' },
  'horizon.year': { zh: '年', en: 'Year' },
  'horizon.activeDays': { zh: '记录天数', en: 'days recorded' },
  'horizon.focusMin': { zh: '专注分钟', en: 'focus min' },
  'horizon.moments': { zh: '瞬间', en: 'moments' },
  'horizon.photos': { zh: '照片', en: 'photos' },
  'horizon.places': { zh: '地点', en: 'places' },
  'horizon.special': { zh: '值得记住', en: 'kept' },
  'horizon.keptLabel': { zh: '留住的话', en: 'In your words' },
  'horizon.empty': { zh: '这段时间还没有记录', en: 'Nothing here yet' },
  // SideNav phase groups
  'sidenav.dailyLoop': { zh: '每日循环', en: 'Daily loop' },
  'sidenav.evidence': { zh: '生活证据', en: 'Evidence' },
  'sidenav.obligations': { zh: '待办事务', en: 'Obligations' },
  // Landing — header & hero
  'landing.tagline': { zh: '你真的活过的证据', en: 'Proof you actually lived' },
  'landing.eyebrow': { zh: '别让你的日子悄悄消失', en: "Don't let your days disappear" },
  'landing.heroTitle1': { zh: '每一天结束时，', en: 'At the end of the day,' },
  'landing.heroTitle2': { zh: '都有你真的活过的证据。', en: 'proof you actually lived.' },
  'landing.heroSub': {
    zh: '你本来就会规划每一天。Evidence of Life 只是安静地留住它周围真正发生的一切——专注时间、照片、地点和笔记——让每一天成为你活过的证据，而不只是被清空的清单。不必写日记，没有连签，也没有动态。',
    en: 'You already plan your day. Evidence of Life quietly keeps what actually happened around it — focus time, photos, places and notes — so each day becomes proof you lived, not just a checklist you cleared. No journaling chore. No streaks. No feed.',
  },
  // Landing — four phases (shared by stats pills & how-it-works)
  'landing.phase.plan': { zh: '规划', en: 'Plan' },
  'landing.phase.live': { zh: '投入', en: 'Live' },
  'landing.phase.capture': { zh: '留存', en: 'Capture' },
  'landing.phase.revisit': { zh: '回望', en: 'Revisit' },
  'landing.stat.planSub': { zh: '任务、截止与日常汇于一条时间线', en: 'tasks, dues and routines on one timeline' },
  'landing.stat.liveSub': { zh: '专注计时记录真实时间', en: 'focus sessions record real time' },
  'landing.stat.captureSub': { zh: '笔记、照片、地点与链接', en: 'notes, photos, places and links' },
  'landing.stat.revisitSub': { zh: '按日、年与地图重温', en: 'browse by day, year and map' },
  // Landing — step details
  'landing.step.plan.title': { zh: '在一天溜走之前规划它', en: 'Plan the day before it runs away' },
  'landing.step.plan.body': { zh: '把任务、日常、日历导入和截止日期放到一条流动的时间线上。', en: 'Put tasks, routines, calendar imports and deadlines onto one living timeline.' },
  'landing.step.live.title': { zh: '把意图变成被记录的时间', en: 'Turn intent into recorded time' },
  'landing.step.live.body': { zh: '从时间线开启一次专注，让你真正投入的时间留在任务上。', en: 'Start a focus session from the timeline so the hours you actually live stay attached to the task.' },
  'landing.step.capture.title': { zh: '留下它发生过的证据', en: 'Capture the evidence it happened' },
  'landing.step.capture.body': { zh: '趁记忆还新鲜，补上笔记、照片、心情、地点或链接。', en: 'Add the note, photo, mood, place or link while the memory is still fresh.' },
  'landing.step.revisit.title': { zh: '按时间与地点重新打开生活', en: 'Reopen life by time and place' },
  'landing.step.revisit.body': { zh: '计划与瞬间沉淀为可随时重温的日、周、月、年和地图。', en: 'Plans and moments settle into a day, week, month, year and map you can revisit anytime.' },
  // Landing — module groups
  'landing.group.core.label': { zh: '核心循环', en: 'Core loop' },
  'landing.group.core.caption': { zh: '每个人最先学会的主循环。', en: 'The main loop everyone learns first.' },
  'landing.group.evidence.label': { zh: '证据类型', en: 'Evidence types' },
  'landing.group.evidence.caption': { zh: '证明生活真实发生的素材。', en: 'The material that proves life happened.' },
  'landing.group.obligations.label': { zh: '生活事务', en: 'Life obligations' },
  'landing.group.obligations.caption': { zh: '推动生活运转的事情。', en: 'The things that keep life moving.' },
  // Landing — modules
  'landing.mod.today.title': { zh: '今日时间线', en: 'Today timeline' },
  'landing.mod.today.body': { zh: '一个界面承载醒着的每一刻：计划、导入事件、待办与记录下的瞬间。', en: 'A single surface for plans, imported events, todos and recorded moments across your waking hours.' },
  'landing.mod.focus.title': { zh: '专注时段', en: 'Focus sessions' },
  'landing.mod.focus.body': { zh: '用番茄钟式的专注记录真实工作时间，并归到它发生的那一天。', en: 'Log real work time from a pomodoro-style session and attach it to the day it happened.' },
  'landing.mod.recap.title': { zh: '快速回顾', en: 'Fast recaps' },
  'landing.mod.recap.body': { zh: '用简短的笔记、照片、心情和标签收尾，不必把记录变成作业。', en: 'Close the loop with short notes, photos, moods and tags without turning journaling into homework.' },
  'landing.mod.recall.title': { zh: '日历与地图回溯', en: 'Calendar and map recall' },
  'landing.mod.recall.body': { zh: '按时间和地点重温你的日子，周、月、年和地图视图让回忆毫不费力。', en: 'Revisit your days by time and place, with week, month, year and map views that make recall effortless.' },
  'landing.mod.photo.title': { zh: '照片证据', en: 'Photo evidence' },
  'landing.mod.photo.body': { zh: '给瞬间附上视觉凭证，让平凡的日子在回看时重新有质感。', en: 'Attach visual proof to moments so ordinary days regain texture when you look back.' },
  'landing.mod.place.title': { zh: '地点记忆', en: 'Place memory' },
  'landing.mod.place.body': { zh: '标记餐厅、咖啡馆、公园、博物馆和旅行，再在私人地图上重新发现它们。', en: 'Tag restaurants, cafes, parks, museums and trips, then rediscover them on a personal map.' },
  'landing.mod.link.title': { zh: '链接与资料', en: 'Links and references' },
  'landing.mod.link.body': { zh: '保存带预览的有用链接，让一天周围的资料始终连着那一天。', en: 'Save useful links with previews so the references around a day stay connected to the day itself.' },
  'landing.mod.dues.title': { zh: '截止与待办', en: 'Deadlines and dues' },
  'landing.mod.dues.body': { zh: '追踪紧急工作、多步骤事务、提醒、照片和链接，不再淹没在笔记里。', en: 'Track urgent work, multi-step obligations, reminders, photos and links without losing them in notes.' },
  'landing.mod.habits.title': { zh: '无负担的习惯', en: 'Habits without guilt' },
  'landing.mod.habits.body': { zh: '把可重复的日常作为生活的一部分呈现，而不是让你羞愧的连签机器。', en: 'Keep repeatable routines visible as part of life, not as a streak machine designed to shame you.' },
  'landing.private.title': { zh: '默认私密', en: 'Private by default' },
  'landing.private.body': { zh: '它被打造成个人的记忆系统，不是社交动态，也不是又一层公开表演。你的证据可随时一键导出为 JSON——即使有一天我们不在了，它仍然属于你。', en: 'Built as a personal memory system, not a social feed and not another public performance layer. Export everything as JSON anytime — even if we disappear, your evidence stays yours.' },
  // Landing — product positioning, how-it-works, narrative
  'landing.product.h2': { zh: '为你的每日计划而生的私人记忆层', en: 'A private memory layer for your daily planning' },
  'landing.product.body': {
    zh: '大多数效率工具只记得你计划了什么，大多数日记则等你自己想起发生了什么。Evidence of Life 把两者连起来：你规划这一天、真正去过它，而证据——专注时间、照片、地点、截止日期、习惯和链接——会自动留存，让未来的你能按时间和地点重新打开它。',
    en: 'Most productivity apps remember what you planned. Most journals wait for you to remember what happened. Evidence of Life connects both: you plan the day, live it, and the evidence — focus time, photos, places, deadlines, habits and links — stays attached, so future-you can reopen it by time and place.',
  },
  'landing.how.h2': { zh: '一个闭环：规划、投入、留存、回望', en: 'One loop: plan, live, capture, revisit' },
  'landing.how.sub': {
    zh: '同一天一直向前流动。你不需要离开「效率模式」才能进入「回忆模式」。',
    en: 'The same day flows forward. You do not leave productivity mode to enter memory mode.',
  },
  'landing.narrative': {
    zh: '「大多数效率工具只记得你计划了什么，大多数日记则等你想起发生了什么。Evidence of Life 把两者连起来——让日子真的累积起来。」',
    en: 'Most productivity apps remember what you planned. Most journals wait for you to remember what happened. Evidence of Life connects both — so the days actually add up.',
  },
  'landing.narrative.label': { zh: '核心营销叙事', en: 'Core marketing narrative' },
  // Landing — header nav & CTAs
  'landing.nav.product': { zh: '产品', en: 'Product' },
  'landing.nav.positioning': { zh: '定位', en: 'Positioning' },
  'landing.nav.how': { zh: '玩法', en: 'How it works' },
  'landing.cta.signIn': { zh: '登录', en: 'Sign in' },
  'landing.cta.startFree': { zh: '免费开始', en: 'Start free' },
  'landing.cta.createAccount': { zh: '创建免费账号', en: 'Create free account' },
  'landing.cta.exploreDemo': { zh: '体验实时演示', en: 'Explore live demo' },
  'landing.cta.liveDemo': { zh: '实时演示', en: 'Live demo' },
  'landing.hero.note': { zh: '免费开始 · 没有社交动态 · 演示使用示例数据', en: 'Free to start. No social feed. Live demo with sample data.' },
  'landing.demo.caption': { zh: '公开演示 · 示例数据', en: 'Public demo. Sample data.' },
  // Landing — feature pillars
  'landing.pillar.center.title': { zh: '一天的指挥中心', en: 'Daily command center' },
  'landing.pillar.center.body': { zh: '在一条时间线上规划、记录、专注与回顾，不必把一天散落在笔记、日历、计时器和相册里。', en: 'Plan, capture, focus and review in one timeline instead of spreading your day across notes, calendar, timers and photos.' },
  'landing.pillar.capture.title': { zh: '记忆优先的捕捉', en: 'Memory-first capture' },
  'landing.pillar.capture.body': { zh: '每个瞬间都带着上下文：笔记、照片、心情、地点、标签和链接，让未来的你看到的不只是一个任务标题。', en: 'Moments keep context: notes, photos, mood, place, tags and links, so future-you sees more than a task title.' },
  'landing.pillar.recall.title': { zh: '日历与地图回溯', en: 'Calendar and map recall' },
  'landing.pillar.recall.body': { zh: '你的生活可以按时间和地点重新打开，月、年和地图视图让回忆毫不费力。', en: 'Your life becomes browsable by time and place, with month, year and map views that make recall effortless.' },
  // Landing — positioning / marketing angle
  'landing.product.eyebrow': { zh: '产品定位', en: 'Product positioning' },
  'landing.angle.eyebrow': { zh: '营销定位', en: 'Marketing angle' },
  'landing.angle.h2': { zh: '介于效率与记忆之间的新品类', en: 'A new category between productivity and memory' },
  'landing.angle.body': {
    zh: '它不想做心理治疗、企业项目管理，也不想做公开的习惯排行榜。它只是一个安静的地方，帮你为时间变成的样子保留凭证。',
    en: 'The product is not trying to be therapy, enterprise project management, or a public habit leaderboard. It is a calm place to keep receipts for what your time became.',
  },
  'landing.angle.todo.title': { zh: '对比待办应用', en: 'Against todo apps' },
  'landing.angle.todo.body': { zh: '待办止于意图。Evidence of Life 把意图和结果留在一起。', en: 'Todos stop at intention. Evidence of Life keeps intention and outcome together.' },
  'landing.angle.journal.title': { zh: '对比日记应用', en: 'Against journals' },
  'landing.angle.journal.body': { zh: '空白页门槛太高。这里的记忆，从你已经计划并完成的事自然生长出来。', en: 'Blank pages are high friction. Here, memory grows from the work you already planned and finished.' },
  'landing.angle.habit.title': { zh: '对比习惯打卡', en: 'Against habit trackers' },
  'landing.angle.habit.body': { zh: '连签优化的是服从。这个产品保留的是上下文、进展和真实的生活质感。', en: 'Streaks optimize compliance. This product preserves context, progress and lived texture.' },
  'landing.fit.title': { zh: '最契合的人', en: 'Best-fit users' },
  'landing.fit.1': { zh: '到周末会问「我这周到底做了什么？」的人。', en: 'People who end the week asking, "What did I actually do?"' },
  'landing.fit.2': { zh: '想要进展凭证、又不想被僵硬效率系统绑住的创造者、学生和自由职业者。', en: 'Builders, students and freelancers who want proof of progress without a rigid productivity system.' },
  'landing.fit.3': { zh: '想把回忆按日期和地点整理好的旅行者、父母和爱反思的人。', en: 'Travelers, parents and reflective people who want memories organized by day and place.' },
  'landing.fit.4': { zh: '同时应付截止、日常、笔记和链接，却想要一份平静日常记录的人。', en: 'Anyone juggling deadlines, routines, notes and links but wanting one calm daily record.' },
  'landing.promise.eyebrow': { zh: '产品承诺', en: 'Product promise' },
  'landing.promise.h3': { zh: '一个尊重平凡生活的日常系统', en: 'A daily system that respects ordinary life' },
  'landing.outcome.1.title': { zh: '更少重建', en: 'Less reconstruction' },
  'landing.outcome.1.body': { zh: '不必再从日历事件、截图和聊天记录里拼凑你的一天。', en: 'Stop piecing together your day from calendar events, screenshots and chat history.' },
  'landing.outcome.2.title': { zh: '更诚实的进展', en: 'More honest progress' },
  'landing.outcome.2.body': { zh: '把计划的时间、专注的时间和真实活过的瞬间并排看清楚。', en: 'See planned time, focused time and lived moments side by side.' },
  'landing.outcome.3.title': { zh: '更丰厚的档案', en: 'A richer archive' },
  'landing.outcome.3.body': { zh: '把平凡的日子变成可检索的证据，而不是任它消失。', en: 'Turn ordinary days into searchable evidence instead of letting them disappear.' },
  // Landing — final CTA
  'landing.final.h2': { zh: '开始为你真实的生活留下凭证', en: 'Start keeping receipts for your real life' },
  'landing.final.body': {
    zh: '规划今天，留住真正发生过的一切，让你的日历和地图悄悄沉淀成一份值得回来的私人档案。',
    en: 'Plan today, capture what actually happened, and let your calendar and map quietly become a private archive worth coming back to.',
  },
};

interface LanguageContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: 'zh',
  setLang: () => {},
  t: (key: string) => key,
});

// Detect the language from the browser/OS locale. Used only as the fallback
// when the user has no saved preference yet; an explicit choice in Settings
// still wins and is persisted to localStorage + profile.
function detectSystemLang(): Lang {
  if (typeof navigator === 'undefined') return 'en';
  const locales = [navigator.language, ...(navigator.languages ?? [])];
  return locales.some((l) => l?.toLowerCase().startsWith('zh')) ? 'zh' : 'en';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = localStorage.getItem('app-language');
    return (stored === 'en' || stored === 'zh') ? stored : detectSystemLang();
  });
  const { profile, updateProfile } = useProfile();

  useEffect(() => {
    const stored = localStorage.getItem('app-language');
    if (stored === 'en' || stored === 'zh') return;

    if (profile?.language && (profile.language === 'en' || profile.language === 'zh')) {
      const next = profile.language as Lang;
      setLangState(next);
      localStorage.setItem('app-language', next);
    }
  }, [profile?.language]);

  const setLang = useCallback((newLang: Lang) => {
    if (newLang === lang) return;
    setLangState(newLang);
    localStorage.setItem('app-language', newLang);
    updateProfile({ language: newLang });
  }, [updateProfile, lang]);

  // Apply lang class to body for font weight
  useEffect(() => {
    document.body.classList.toggle('lang-zh', lang === 'zh');
  }, [lang]);

  const t = useCallback((key: string) => {
    const entry = translations[key];
    if (!entry) return key;
    const val = entry[lang];
    return val !== undefined ? val : key;
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useLanguage = () => useContext(LanguageContext);
