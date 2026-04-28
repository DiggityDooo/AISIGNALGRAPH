/**
 * AISIGNALGRAPH // Flow Field Background
 * A Three.js based particle system mimicking neural data streams.
 */

(function initFlowField() {
    const canvas = document.getElementById('flow-canvas');
    if (!canvas || typeof THREE === 'undefined') return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Particle Geometry
    const particlesCount = 1500;
    const positions = new Float32Array(particlesCount * 3);
    const velocities = new Float32Array(particlesCount);
    const sizes = new Float32Array(particlesCount);

    for (let i = 0; i < particlesCount * 3; i += 3) {
        positions[i] = (Math.random() - 0.5) * 10;     // X
        positions[i + 1] = (Math.random() - 0.5) * 10; // Y
        positions[i + 2] = (Math.random() - 0.5) * 10; // Z
        
        velocities[i/3] = 0.01 + Math.random() * 0.02;
        sizes[i/3] = Math.random() * 2;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Material
    const material = new THREE.PointsMaterial({
        size: 0.015,
        color: 0xff3148,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    camera.position.z = 5;

    // Interaction
    let mouseX = 0;
    let mouseY = 0;

    window.addEventListener('mousemove', (event) => {
        mouseX = (event.clientX / window.innerWidth) - 0.5;
        mouseY = (event.clientY / window.innerHeight) - 0.5;
    });

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Animation Loop
    function animate() {
        requestAnimationFrame(animate);

        const currentPositions = geometry.attributes.position.array;
        
        for (let i = 0; i < particlesCount; i++) {
            const i3 = i * 3;
            
            // Move particles along X axis
            currentPositions[i3] += velocities[i];
            
            // Interaction with mouse
            currentPositions[i3 + 1] += (mouseY * 0.1 - currentPositions[i3 + 1]) * 0.01;
            
            // Loop particles
            if (currentPositions[i3] > 5) {
                currentPositions[i3] = -5;
                currentPositions[i3 + 1] = (Math.random() - 0.5) * 10;
            }
        }
        
        geometry.attributes.position.needsUpdate = true;
        
        // Subtle camera movement
        camera.position.x += (mouseX * 0.5 - camera.position.x) * 0.05;
        camera.position.y += (-mouseY * 0.5 - camera.position.y) * 0.05;
        camera.lookAt(scene.position);

        renderer.render(scene, camera);
    }

    animate();
})();
