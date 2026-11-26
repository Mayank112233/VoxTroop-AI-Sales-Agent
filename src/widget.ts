const origin = import.meta.env.VITE_VOXTROOP_URL || 'http://127.0.0.1:8000'
let launcher: Promise<HTMLButtonElement> | undefined

export function loadCounsellor() {
  if (launcher) return launcher
  launcher = new Promise<HTMLButtonElement>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = new URL('/widget.js', origin).href
    script.dataset.business = 'edunext'
    // The SDK exposes a launcher button but has no public open() method.
    const observer = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement) || !node.querySelector('iframe[title="VoxTroop assistant"]')) continue
        const button = node.querySelector('button')
        if (button) {
          observer.disconnect()
          resolve(button)
          return
        }
      }
    })
    observer.observe(document.body, { childList: true })
    script.onerror = () => {
      observer.disconnect()
      script.remove()
      reject(new Error('The VoxTroop counsellor could not load.'))
    }
    script.onload = () => queueMicrotask(() => {
      observer.disconnect()
      reject(new Error('The VoxTroop launcher is unavailable.'))
    })
    document.body.append(script)
  }).catch(error => {
    launcher = undefined
    throw error
  })
  return launcher
}

export async function openCounsellor() {
  const button = await loadCounsellor()
  if (button.getAttribute('aria-expanded') !== 'true') button.click()
}
