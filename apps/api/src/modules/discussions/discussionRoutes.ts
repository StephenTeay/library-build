import { Router, Request, Response } from 'express';
import { pool } from '../../db/pool.js';
import { authenticate } from '../../middleware/auth.js';
import { canAccessCourseContent, canManageCourse } from '../../middleware/roleScope.js';

export const discussionRouter = Router();

// 1. List threads for a course
discussionRouter.get('/course/:course_id', authenticate, async (req: Request, res: Response) => {
  const courseId = Number(req.params.course_id);

  const canAccess = await canAccessCourseContent(req.user!.userId, req.user!.role, req.user!.departmentId, courseId);
  if (!canAccess) {
    res.status(403).json({ error: 'Forbidden', message: 'You are not enrolled in this course.' });
    return;
  }

  const threadsRes = await pool.query(
    `SELECT t.id, t.course_id, t.title, t.content, t.is_pinned, t.is_locked,
            t.created_at, t.updated_at, u.full_name as author_name, u.role as author_role,
            COUNT(p.id)::int as reply_count
     FROM discussion_threads t
     JOIN users u ON t.user_id = u.id
     LEFT JOIN discussion_posts p ON t.id = p.thread_id AND p.is_deleted = FALSE
     WHERE t.course_id = $1 AND t.is_deleted = FALSE
     GROUP BY t.id, u.full_name, u.role
     ORDER BY t.is_pinned DESC, t.created_at DESC;`,
    [courseId]
  );

  res.status(200).json({ threads: threadsRes.rows });
});

// 2. Create thread in a course
discussionRouter.post('/course/:course_id', authenticate, async (req: Request, res: Response) => {
  const courseId = Number(req.params.course_id);
  const { title, content } = req.body || {};

  if (!title || !content) {
    res.status(400).json({ error: 'Bad Request', message: 'Title and content are required.' });
    return;
  }

  const canAccess = await canAccessCourseContent(req.user!.userId, req.user!.role, req.user!.departmentId, courseId);
  if (!canAccess) {
    res.status(403).json({ error: 'Forbidden', message: 'Not authorized to participate in this course forum.' });
    return;
  }

  const insertRes = await pool.query(
    `INSERT INTO discussion_threads (course_id, user_id, title, content)
     VALUES ($1, $2, $3, $4)
     RETURNING *;`,
    [courseId, req.user!.userId, title.trim(), content.trim()]
  );

  const userRow = await pool.query('SELECT full_name FROM users WHERE id = $1', [req.user!.userId]);
  const authorName = userRow.rows[0]?.full_name || req.user!.email;

  const thread = {
    ...insertRes.rows[0],
    author_name: authorName,
    author_role: req.user!.role,
    reply_count: 0,
  };

  res.status(201).json({ thread });
});

// 3. Get thread details & posts
discussionRouter.get('/thread/:thread_id', authenticate, async (req: Request, res: Response) => {
  const threadId = Number(req.params.thread_id);

  const threadRes = await pool.query(
    `SELECT t.*, u.full_name as author_name, u.role as author_role
     FROM discussion_threads t
     JOIN users u ON t.user_id = u.id
     WHERE t.id = $1 AND t.is_deleted = FALSE;`,
    [threadId]
  );

  if (threadRes.rows.length === 0) {
    res.status(404).json({ error: 'Not Found', message: 'Discussion thread not found' });
    return;
  }

  const thread = threadRes.rows[0];

  const canAccess = await canAccessCourseContent(req.user!.userId, req.user!.role, req.user!.departmentId, thread.course_id);
  if (!canAccess) {
    res.status(403).json({ error: 'Forbidden', message: 'Access denied to this course forum.' });
    return;
  }

  const postsRes = await pool.query(
    `SELECT p.id, p.thread_id, p.parent_post_id,
            CASE WHEN p.is_deleted THEN '[This comment has been removed by a moderator]' ELSE p.content END as content,
            p.is_deleted, p.created_at, u.full_name as author_name, u.role as author_role
     FROM discussion_posts p
     JOIN users u ON p.user_id = u.id
     WHERE p.thread_id = $1
     ORDER BY p.created_at ASC;`,
    [threadId]
  );

  res.status(200).json({ thread, posts: postsRes.rows });
});

// 4. Post a reply
discussionRouter.post('/thread/:thread_id/posts', authenticate, async (req: Request, res: Response) => {
  const threadId = Number(req.params.thread_id);
  const { content, parent_post_id } = req.body || {};

  if (!content) {
    res.status(400).json({ error: 'Bad Request', message: 'Reply content cannot be empty.' });
    return;
  }

  const threadRes = await pool.query('SELECT course_id, is_locked FROM discussion_threads WHERE id = $1 AND is_deleted = FALSE', [threadId]);
  if (threadRes.rows.length === 0) {
    res.status(404).json({ error: 'Not Found', message: 'Thread not found' });
    return;
  }

  if (threadRes.rows[0].is_locked) {
    res.status(403).json({ error: 'Locked', message: 'This thread is locked by the course lecturer.' });
    return;
  }

  const courseId = threadRes.rows[0].course_id;
  const canAccess = await canAccessCourseContent(req.user!.userId, req.user!.role, req.user!.departmentId, courseId);
  if (!canAccess) {
    res.status(403).json({ error: 'Forbidden', message: 'Access denied.' });
    return;
  }

  const insertRes = await pool.query(
    `INSERT INTO discussion_posts (thread_id, user_id, parent_post_id, content)
     VALUES ($1, $2, $3, $4)
     RETURNING *;`,
    [threadId, req.user!.userId, parent_post_id ? Number(parent_post_id) : null, content.trim()]
  );

  const userRow = await pool.query('SELECT full_name FROM users WHERE id = $1', [req.user!.userId]);
  const authorName = userRow.rows[0]?.full_name || req.user!.email;

  const post = {
    ...insertRes.rows[0],
    author_name: authorName,
    author_role: req.user!.role,
  };

  res.status(201).json({ post });
});

// 5. Moderate / Soft delete post
discussionRouter.delete('/posts/:post_id', authenticate, async (req: Request, res: Response) => {
  const postId = Number(req.params.post_id);

  const postRes = await pool.query(
    `SELECT p.id, p.user_id, t.course_id
     FROM discussion_posts p
     JOIN discussion_threads t ON p.thread_id = t.id
     WHERE p.id = $1`,
    [postId]
  );

  if (postRes.rows.length === 0) {
    res.status(404).json({ error: 'Not Found', message: 'Post not found' });
    return;
  }

  const post = postRes.rows[0];

  const isAuthor = post.user_id === req.user!.userId;
  const canManage = await canManageCourse(req.user!.userId, req.user!.role, req.user!.departmentId, post.course_id);

  if (!isAuthor && !canManage) {
    res.status(403).json({ error: 'Forbidden', message: 'Only author or course lecturer can delete this post.' });
    return;
  }

  // Soft delete per prompt specification
  await pool.query('UPDATE discussion_posts SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1', [postId]);

  res.status(200).json({ success: true, message: 'Post soft deleted successfully' });
});

