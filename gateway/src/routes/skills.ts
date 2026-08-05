// AgentX Gateway — Skills Route
// Public skill marketplace + publisher submission + admin review

import { Router, Request, Response } from 'express'
import { getSkillService } from '../services/skill-service'
import { adminAuth } from '../middleware/adminAuth'

const router = Router()

// GET /api/v1/skills — Browse approved skill templates (public)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { category, page, limit } = req.query
    const result = await getSkillService().list({
      category: category as string,
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
    })
    res.json(result)
  } catch (err) {
    console.error('[Skills] List error:', err)
    res.status(500).json({ error: 'Failed to list skills' })
  }
})

// GET /api/v1/skills/:id — Skill detail (public)
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const skill = await getSkillService().getById(parseInt(req.params.id))
    if (!skill) return res.status(404).json({ error: 'Skill not found' })
    res.json(skill)
  } catch (err) {
    console.error('[Skills] Get error:', err)
    res.status(500).json({ error: 'Failed to get skill' })
  }
})

// POST /api/v1/skills — Submit a new skill for review (JWT auth)
router.post('/', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    if (!user?.address) return res.status(401).json({ error: 'Authentication required' })

    const { name, description, category, inputSchema, outputSchema } = req.body
    if (!name || !description || !category || !inputSchema) {
      return res.status(400).json({ error: 'name, description, category, and inputSchema are required' })
    }

    const skill = await getSkillService().submit({
      name: String(name),
      description: String(description),
      category: String(category),
      inputSchema,
      outputSchema,
      publisher: user.address,
    })

    res.status(201).json(skill)
  } catch (err) {
    console.error('[Skills] Submit error:', err)
    res.status(500).json({ error: 'Failed to submit skill' })
  }
})

// GET /api/v1/skills/my — Publisher's submitted skills (JWT auth)
router.get('/my', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    if (!user?.address) return res.status(401).json({ error: 'Authentication required' })

    const skills = await getSkillService().listByPublisher(user.address)
    res.json({ skills })
  } catch (err) {
    console.error('[Skills] My list error:', err)
    res.status(500).json({ error: 'Failed to list your skills' })
  }
})

// PUT /api/v1/skills/:id/review — Admin: approve/reject a skill (Admin auth)
router.put('/:id/review', adminAuth, async (req: Request, res: Response) => {
  try {
    const { action, note } = req.body
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'action must be "approve" or "reject"' })
    }

    const skill = await getSkillService().review({
      id: parseInt(req.params.id),
      action,
      reviewer: 'admin',
      note,
    })

    if (!skill) return res.status(404).json({ error: 'Skill not found or not in pending state' })
    res.json(skill)
  } catch (err) {
    console.error('[Skills] Review error:', err)
    res.status(500).json({ error: 'Failed to review skill' })
  }
})

export default router
