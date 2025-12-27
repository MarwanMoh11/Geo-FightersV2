import * as THREE from 'three';

export function initRenderer() {
    // 1. The Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222); // Dark Grey (easier on eyes than black)

    // Replace the camera line in src/core/renderer.ts
    const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 1000);

    // "Hades" style is high up and angled significantly
    // We move it further away (40, 40) because the narrow FOV zooms us in.
    camera.position.set(0, 40, 40);
    camera.lookAt(0, 0, 0);

    // 3. The Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // 4. "Greybox" Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // 5. The Reference Grid (The Floor)
    // Instead of a texture, we use a grid to visualize movement speed accurately.
    const gridHelper = new THREE.GridHelper(100, 100, 0x444444, 0x333333);
    scene.add(gridHelper);

    // 6. Responsive Window
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    return { scene, camera, renderer };
}