/* ===================================
   Katharina Kutscher Portfolio
   Main JavaScript
   =================================== */

document.addEventListener('DOMContentLoaded', function() {
  // Mobile Menu Toggle
  initMobileMenu();

  // Testimonial Slider
  initTestimonialSlider();

  // Smooth Scroll for anchor links
  initSmoothScroll();

  // Add scroll effects
  initScrollEffects();
});

/* ===================================
   Mobile Menu
   =================================== */
function initMobileMenu() {
  const menuToggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.nav');

  if (menuToggle && nav) {
    menuToggle.addEventListener('click', function() {
      menuToggle.classList.toggle('active');
      nav.classList.toggle('active');
      document.body.style.overflow = nav.classList.contains('active') ? 'hidden' : '';
    });

    // Close menu when clicking a link
    nav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', function() {
        menuToggle.classList.remove('active');
        nav.classList.remove('active');
        document.body.style.overflow = '';
      });
    });

    // Close menu on escape key
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && nav.classList.contains('active')) {
        menuToggle.classList.remove('active');
        nav.classList.remove('active');
        document.body.style.overflow = '';
      }
    });
  }
}

/* ===================================
   Testimonial Slider
   =================================== */
function initTestimonialSlider() {
  const slider = document.querySelector('.testimonial-slider');
  if (!slider) return;

  const slides = slider.querySelectorAll('.testimonial-slide');
  const dots = document.querySelectorAll('.testimonial-dots .dot');
  const prevBtn = slider.querySelector('.testimonial-prev');
  const nextBtn = slider.querySelector('.testimonial-next');

  if (slides.length === 0) return;

  let currentSlide = 0;
  let autoPlayInterval = null;

  function showSlide(index) {
    if (index >= slides.length) index = 0;
    if (index < 0) index = slides.length - 1;

    slides.forEach(slide => slide.classList.remove('active'));
    dots.forEach(dot => dot.classList.remove('active'));

    slides[index].classList.add('active');
    if (dots[index]) dots[index].classList.add('active');

    currentSlide = index;
  }

  function nextSlide() { showSlide(currentSlide + 1); }
  function prevSlide() { showSlide(currentSlide - 1); }

  // Wix home testimonial slideshow auto-cycles every ~3s while in view
  function startAutoPlay() {
    stopAutoPlay();
    autoPlayInterval = setInterval(nextSlide, 3000);
  }

  function stopAutoPlay() {
    if (autoPlayInterval) { clearInterval(autoPlayInterval); autoPlayInterval = null; }
  }

  function manualNav(fn) {
    stopAutoPlay();
    fn();
    startAutoPlay();
  }

  if (prevBtn) prevBtn.addEventListener('click', () => manualNav(prevSlide));
  if (nextBtn) nextBtn.addEventListener('click', () => manualNav(nextSlide));

  dots.forEach((dot, index) => {
    dot.addEventListener('click', () => manualNav(() => showSlide(index)));
  });

  // Touch/swipe support
  let touchStartX = 0;
  slider.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, { passive: true });
  slider.addEventListener('touchend', e => {
    const diff = touchStartX - e.changedTouches[0].screenX;
    if (Math.abs(diff) > 50) manualNav(diff > 0 ? nextSlide : prevSlide);
  }, { passive: true });

  // Only auto-play while the slider is on screen (matches Wix behavior)
  let inView = false;
  function syncAutoPlay() {
    if (inView && !document.hidden) startAutoPlay();
    else stopAutoPlay();
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      inView = entries[0].isIntersecting;
      syncAutoPlay();
    }, { threshold: 0.2 }).observe(slider);
  } else {
    inView = true;
  }
  document.addEventListener('visibilitychange', syncAutoPlay);

  showSlide(0);
  syncAutoPlay();
}

/* ===================================
   Smooth Scroll
   =================================== */
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;

      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        const headerOffset = 100;
        const elementPosition = target.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      }
    });
  });
}

/* ===================================
   Scroll Effects
   =================================== */
function initScrollEffects() {
  const header = document.querySelector('.header');

  // Header background on scroll
  if (header) {
    let lastScroll = 0;

    window.addEventListener('scroll', function() {
      const currentScroll = window.pageYOffset;

      if (currentScroll > 50) {
        header.style.backgroundColor = 'rgba(166, 127, 131, 0.95)';
        header.style.backdropFilter = 'blur(10px)';
        header.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
      } else {
        header.style.backgroundColor = 'var(--color-primary)';
        header.style.backdropFilter = 'none';
        header.style.boxShadow = 'none';
      }

      lastScroll = currentScroll;
    }, { passive: true });
  }

  // Fade in elements on scroll
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };

  const observer = new IntersectionObserver(function(entries) {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('fade-in-visible');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  document.querySelectorAll('.fade-in').forEach(el => {
    observer.observe(el);
  });

  // Portfolio bag spiral animation
  const bagContainer = document.querySelector('.bag-container');
  if (bagContainer) {
    const portfolioItems = bagContainer.querySelectorAll('.portfolio-item');

    const bagObserver = new IntersectionObserver(function(entries) {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          // Animate each portfolio item with staggered delay
          portfolioItems.forEach((item) => {
            item.classList.add('animate-in');
          });
          bagObserver.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.3,
      rootMargin: '0px 0px -100px 0px'
    });

    bagObserver.observe(bagContainer);
  }

  // General scroll animations
  const scrollAnimateElements = document.querySelectorAll('.scroll-animate, .anim-turn');
  const scrollObserver = new IntersectionObserver(function(entries) {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-in');
        scrollObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  });

  scrollAnimateElements.forEach(el => {
    scrollObserver.observe(el);
  });
}

/* ===================================
   Image Lightbox (for galleries)
   =================================== */
function initLightbox() {
  const galleryImages = document.querySelectorAll('.photo-gallery img, .content-grid img');

  if (galleryImages.length === 0) return;

  // Create lightbox elements
  const lightbox = document.createElement('div');
  lightbox.className = 'lightbox';
  lightbox.innerHTML = `
    <button class="lightbox-close">&times;</button>
    <button class="lightbox-prev">&lsaquo;</button>
    <button class="lightbox-next">&rsaquo;</button>
    <img class="lightbox-image" src="" alt="">
  `;
  document.body.appendChild(lightbox);

  const lightboxImage = lightbox.querySelector('.lightbox-image');
  const closeBtn = lightbox.querySelector('.lightbox-close');
  const prevBtn = lightbox.querySelector('.lightbox-prev');
  const nextBtn = lightbox.querySelector('.lightbox-next');

  let currentImages = [];
  let currentIndex = 0;

  function openLightbox(images, index) {
    currentImages = images;
    currentIndex = index;
    lightboxImage.src = images[index].src;
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
  }

  function showNext() {
    currentIndex = (currentIndex + 1) % currentImages.length;
    lightboxImage.src = currentImages[currentIndex].src;
  }

  function showPrev() {
    currentIndex = (currentIndex - 1 + currentImages.length) % currentImages.length;
    lightboxImage.src = currentImages[currentIndex].src;
  }

  galleryImages.forEach((img, index) => {
    img.style.cursor = 'pointer';
    img.addEventListener('click', function() {
      openLightbox(Array.from(galleryImages), index);
    });
  });

  closeBtn.addEventListener('click', closeLightbox);
  prevBtn.addEventListener('click', showPrev);
  nextBtn.addEventListener('click', showNext);

  lightbox.addEventListener('click', function(e) {
    if (e.target === lightbox) {
      closeLightbox();
    }
  });

  document.addEventListener('keydown', function(e) {
    if (!lightbox.classList.contains('active')) return;

    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowRight') showNext();
    if (e.key === 'ArrowLeft') showPrev();
  });
}

// Initialize lightbox when DOM is ready
document.addEventListener('DOMContentLoaded', initLightbox);
