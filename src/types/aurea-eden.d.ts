declare module 'aurea-eden' {
  const BpmnDiagram: any
  export { BpmnDiagram }
}

declare module 'aurea-eden/lib/diagrams/Diagram.js' {
  export class Diagram {
    scene: any
    camera: any
    renderer: any
    controls: any
    mode: string
    constructor(container: HTMLElement, options?: { theme?: string; mode?: string })
    setMode(mode: string, cb?: () => void): void
    enablePerspectiveCamera(camera?: any): void
    enableOrthographicCamera(camera?: any): void
    fitScreen(): void
    dispose(): void
  }
}

declare module 'aurea-eden/lib/elements/Element.js' {
  export class Element {
    constructor(id: string, shape: any)
  }
}

declare module 'aurea-eden/lib/shapes/Shape.js' {
  import type * as THREE from 'three'
  export class Shape {
    constructor(geometry: THREE.BufferGeometry, material: THREE.Material)
    geometry: THREE.BufferGeometry
    material: THREE.Material
  }
}
