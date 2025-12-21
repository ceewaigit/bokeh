import { CommandManager, DefaultCommandContext } from '@/lib/commands'
import type { CommandResult } from '@/lib/commands/base/Command'
import { Command } from '@/lib/commands/base/Command'
import type { ProjectStore } from '@/types/stores'

class CounterCommand extends Command<{ value: number }> {
  constructor(private ctx: DefaultCommandContext, private delta: number) {
    super({ name: 'CounterCommand' })
  }

  canExecute() {
    return true
  }

  async doExecute(): Promise<CommandResult<{ value: number }>> {
    const store = this.ctx.getStore() as any
    store.value = (store.value || 0) + this.delta
    await Promise.resolve()
    return { success: true, data: { value: store.value } }
  }

  async doUndo(): Promise<CommandResult<{ value: number }>> {
    const store = this.ctx.getStore() as any
    store.value = (store.value || 0) - this.delta
    await Promise.resolve()
    return { success: true, data: { value: store.value } }
  }
}

function createStoreAccessor(): { getState: () => ProjectStore } {
  const state: any = {
    currentProject: null,
    currentTime: 0,
    selectedClips: [],
    selectedEffectLayer: null,
    clipboard: {}
  }
  return { getState: () => state as ProjectStore }
}

describe('CommandManager execution queue', () => {
  afterEach(() => {
    try {
      CommandManager.getInstance().clearHistory()
    } catch {
      // ignore
    }
  })

  test('serializes rapid execute calls instead of dropping them', async () => {
    const ctx = new DefaultCommandContext(createStoreAccessor() as any)
    const manager = CommandManager.getInstance(ctx)
    manager.setContext(ctx)
    manager.clearHistory()

    const p1 = manager.execute(new CounterCommand(ctx, 1))
    const p2 = manager.execute(new CounterCommand(ctx, 1))
    const [r1, r2] = await Promise.all([p1, p2])

    expect(r1.success).toBe(true)
    expect(r2.success).toBe(true)
    expect((ctx.getStore() as any).value).toBe(2)
  })
})

