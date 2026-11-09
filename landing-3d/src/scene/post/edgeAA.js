import * as THREE from 'three';

// Suavizado de bordes en pantalla, después del tone mapping. No modifica la profundidad.
export const EdgeAA = {
  uniforms: { tDiffuse: { value: null }, texel: { value: new THREE.Vector2(1, 1) } },
  vertexShader: `varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 texel;
    varying vec2 vUv;
    float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
    void main() {
      vec4 center = texture2D(tDiffuse, vUv);
      float nw = luma(texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * texel).rgb);
      float ne = luma(texture2D(tDiffuse, vUv + vec2(1.0, -1.0) * texel).rgb);
      float sw = luma(texture2D(tDiffuse, vUv + vec2(-1.0, 1.0) * texel).rgb);
      float se = luma(texture2D(tDiffuse, vUv + vec2(1.0, 1.0) * texel).rgb);
      float mid = luma(center.rgb);
      float lo = min(mid, min(min(nw, ne), min(sw, se)));
      float hi = max(mid, max(max(nw, ne), max(sw, se)));
      if (hi - lo < max(0.025, hi * 0.12)) { gl_FragColor = center; return; }
      vec2 direction = vec2(-((nw + ne) - (sw + se)), (nw + sw) - (ne + se));
      float reduce = max((nw + ne + sw + se) * 0.03125, 0.0078125);
      direction = clamp(direction / (min(abs(direction.x), abs(direction.y)) + reduce), -6.0, 6.0) * texel;
      vec3 a = 0.5 * (texture2D(tDiffuse, vUv - direction / 6.0).rgb + texture2D(tDiffuse, vUv + direction / 6.0).rgb);
      vec3 b = a * 0.5 + 0.25 * (texture2D(tDiffuse, vUv - direction * 0.5).rgb + texture2D(tDiffuse, vUv + direction * 0.5).rgb);
      float lb = luma(b);
      gl_FragColor = vec4(lb < lo || lb > hi ? a : b, center.a);
    }`,
};
