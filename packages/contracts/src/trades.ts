import { z } from 'zod'

export const professionSchema = z.enum(['electrician', 'plumber', 'painter'])
export type Profession = z.infer<typeof professionSchema>

// Keys and skill slugs match the database; labels live in the locale files.
export const trades = {
  electrician: {
    skills: [
      'residential_wiring',
      'commercial_wiring',
      'db_installation',
      'fault_diagnosis',
      'appliance_installation',
      'solar_installation',
      'maintenance',
      'switch_socket_installation',
      'safety_experience',
      'emergency_service',
    ],
    fields: {
      tools: 'stringList',
      safety_experience: 'text',
      emergency_available: 'boolean',
    },
  },
  plumber: {
    skills: [
      'pipe_fitting',
      'leakage_repair',
      'bathroom_installation',
      'drainage_work',
      'water_tank_installation',
      'geyser_installation',
      'water_pump_work',
      'fixture_installation',
      'maintenance',
      'emergency_service',
    ],
    fields: {
      tools: 'stringList',
      materials: 'stringList',
      emergency_available: 'boolean',
    },
  },
  painter: {
    skills: [
      'interior_painting',
      'exterior_painting',
      'wall_preparation',
      'wall_putty',
      'texture_work',
      'wood_polish',
      'spray_painting',
      'finishing',
      'repainting',
      'surface_preparation',
    ],
    fields: { paint_types: 'stringList', area_experience: 'text' },
  },
} as const satisfies Record<
  Profession,
  {
    skills: readonly string[]
    fields: Record<string, 'stringList' | 'text' | 'boolean'>
  }
>

const list = z.array(z.string().max(100)).max(20)
const text = z.string().max(500)
export const tradeDetailsSchemas = {
  electrician: z.strictObject({
    tools: list.optional(),
    safety_experience: text.optional(),
    emergency_available: z.boolean().optional(),
  }),
  plumber: z.strictObject({
    tools: list.optional(),
    materials: list.optional(),
    emergency_available: z.boolean().optional(),
  }),
  painter: z.strictObject({
    paint_types: list.optional(),
    area_experience: text.optional(),
  }),
} satisfies Record<Profession, z.ZodType>
