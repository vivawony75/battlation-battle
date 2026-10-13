/**
 * 배틀레이션 (Battleration) - 고품질 HTML5 Canvas 2D 전술 렌더러
 * 포탄 포물선 비행, 화면 흔들림, 파티클 시스템, 조명탄 및 안개 시각화
 */

class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // 그리드 규격 (가로 30 x 세로 20)
    this.cols = 30;
    this.rows = 20;
    this.cellSize = 28; // 셀 기본 크기
    this.offsetX = 36; // 좌표축 여백
    this.offsetY = 32;

    this.width = this.cols * this.cellSize + this.offsetX + 20;
    this.height = this.rows * this.cellSize + this.offsetY + 20;
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    // 비주얼 FX 상태
    this.projectiles = []; // 날아가는 포탄 목록
    this.particles = [];   // 폭발, 연기, 파편 파티클
    this.flares = [];      // 조명탄 연출 목록
    this.floatingTexts = []; // 플로팅 데미지/상태 텍스트
    
    // 화면 흔들림 (Screen Shake)
    this.shakeIntensity = 0;
    this.shakeDecay = 0.9;
    this.shakeOffsetX = 0;
    this.shakeOffsetY = 0;

    // 호버 위치
    this.hoverCol = -1;
    this.hoverRow = -1;

    // 흙먼지 십자 잔상 애니메이션 타이머
    this.time = 0;
  }

  // 화면 흔들림 유발
  triggerShake(intensity = 8) {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  // 포탄 및 기관총 탄환 발사 애니메이션 추가
  addProjectile(startX, startY, targetCol, targetRow, isHit, isBlindSpot, hitUnitName, onImpact, weaponType = '81MM') {
    const targetCellX = this.offsetX + targetCol * this.cellSize + this.cellSize / 2;
    const targetCellY = this.offsetY + targetRow * this.cellSize + this.cellSize / 2;

    if (weaponType === 'MG') {
      // 기관총 진지: 포탄 대신 3연사 2회 사격 (총 6발의 묵직한 점사 탄환)
      // 1차 3연사: 0ms, 85ms, 170ms
      // 2차 3연사: 340ms, 425ms, 510ms
      const shotDelays = [0, 85, 170, 340, 425, 510];

      shotDelays.forEach((delay, idx) => {
        setTimeout(() => {
          if (window.soundFX) window.soundFX.playHeavyMGShot();

          const isLastBullet = (idx === shotDelays.length - 1);

          this.projectiles.push({
            type: 'MG_BULLET',
            startX: startX + (Math.random() - 0.5) * 4,
            startY: startY + (Math.random() - 0.5) * 4,
            targetX: targetCellX + (Math.random() - 0.5) * 8,
            targetY: targetCellY + (Math.random() - 0.5) * 8,
            targetCol,
            targetRow,
            progress: 0,
            speed: 0.045 + Math.random() * 0.005, // 기관총 고속 궤적
            heightMax: 18 + Math.random() * 8,    // 낮은 직사 탄도
            trail: [],
            isHit,
            isBlindSpot,
            hitUnitName,
            isLastBullet,
            onImpact: isLastBullet ? onImpact : null
          });
        }, delay);
      });
      return;
    }

    // 대대본부 / 화기중대 / 일반중대: 81mm 대형 박격포 고폭탄 (천천히 웅장하게 비행, 꼬리 불꽃 분출)
    this.projectiles.push({
      type: '81MM_SHELL',
      startX,
      startY,
      targetX: targetCellX,
      targetY: targetCellY,
      targetCol,
      targetRow,
      progress: 0,
      speed: 0.0067 + Math.random() * 0.0011, // 포탄 비행 속도 (약 2.3초 비행)
      heightMax: 155 + Math.random() * 25,  // 웅장한 포물선 고도
      trail: [],
      isHit,
      isBlindSpot,
      hitUnitName,
      prevX: startX,
      prevY: startY,
      onImpact
    });
  }

  // 폭발/흙먼지 파티클 생성
  createExplosion(x, y, isHit, isBlindSpot) {
    if (isBlindSpot) {
      // 산맥 사각지대 도탄 스파크
      for (let i = 0; i < 18; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = 2 + Math.random() * 5;
        this.particles.push({
          x, y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd - 1,
          size: 2 + Math.random() * 2,
          color: '#fbbf24',
          alpha: 1,
          decay: 0.03 + Math.random() * 0.03,
          gravity: 0.15
        });
      }
      this.addFloatingText(x, y - 10, '사각지대 방어!', '#fbbf24');
      return;
    }

    if (isHit) {
      // 대형 화염 및 파편 폭발
      this.triggerShake(12);

      // 화염 구체 파티클
      for (let i = 0; i < 28; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = 1.5 + Math.random() * 5.5;
        this.particles.push({
          x, y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd - 1.2,
          size: 4 + Math.random() * 6,
          color: Math.random() > 0.4 ? '#ef4444' : '#f59e0b',
          alpha: 1,
          decay: 0.02 + Math.random() * 0.025,
          gravity: 0.05
        });
      }

      // 검은 연기 파티클
      for (let i = 0; i < 15; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = 0.5 + Math.random() * 2;
        this.particles.push({
          x, y,
          vx: Math.cos(angle) * spd,
          vy: -1.2 - Math.random() * 1.5,
          size: 6 + Math.random() * 8,
          color: '#334155',
          alpha: 0.8,
          decay: 0.012,
          gravity: -0.02
        });
      }
    } else {
      // 빗나감 (공터 명중 - 흙먼지 퍼프)
      this.triggerShake(3);

      for (let i = 0; i < 18; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = 1 + Math.random() * 3.5;
        this.particles.push({
          x, y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd - 0.5,
          size: 3 + Math.random() * 5,
          color: '#94a3b8',
          alpha: 0.75,
          decay: 0.025 + Math.random() * 0.02,
          gravity: 0.03
        });
      }
    }
  }

  // 조명탄 활성화
  addFlare(col, row, radius) {
    const x = this.offsetX + col * this.cellSize + this.cellSize / 2;
    const y = this.offsetY + row * this.cellSize + this.cellSize / 2;
    this.flares.push({
      col, row, radius,
      x, y,
      alpha: 1,
      life: 180, // 약 3초 유지
      maxLife: 180
    });
  }

  // 플로팅 텍스트 추가
  addFloatingText(x, y, text, color = '#fff') {
    this.floatingTexts.push({
      x, y, text, color,
      alpha: 1,
      vy: -0.8
    });
  }

  // 메인 렌더링 루프
  render(gameState) {
    this.time += 0.05;

    // 화면 흔들림 계산
    if (this.shakeIntensity > 0.2) {
      this.shakeOffsetX = (Math.random() - 0.5) * this.shakeIntensity * 2;
      this.shakeOffsetY = (Math.random() - 0.5) * this.shakeIntensity * 2;
      this.shakeIntensity *= this.shakeDecay;
    } else {
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
      this.shakeIntensity = 0;
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.translate(this.shakeOffsetX, this.shakeOffsetY);

    // 1. 전술 맵 배경 및 그리드 그리기
    this.drawBackground(ctx);
    this.drawAxisLabels(ctx);
    this.drawFrontline(ctx);

    // 2. 산(Mountain) 지형 및 사각지대 그리기
    this.drawMountains(ctx, gameState.mountains);

    // 3. 아군 진영 부대 그리기 (배치 중 or 전투 중)
    this.drawPlayerUnits(ctx, gameState);

    // 4. 적군 진영 안개 및 적 부대 피격/정찰 상태 그리기
    this.drawEnemyArea(ctx, gameState);

    // 5. 십자 흙먼지 흔적 (Cross Splash Markers) 그리기
    this.drawSplashMarkers(ctx, gameState);

    // 6. 플레이어 타겟 조준 마커 (Crosshair / Multi-target)
    this.drawTargetMarkers(ctx, gameState);

    // 7. 호버 하이라이트
    this.drawHover(ctx, gameState);

    // 8. 조명탄 효과 렌더링
    this.drawFlares(ctx);

    // 9. 포탄 비행 궤적 및 포탄 그리기
    this.updateAndDrawProjectiles(ctx);

    // 10. 파티클 업데이트 및 그리기
    this.updateAndDrawParticles(ctx);

    // 11. 플로팅 텍스트 그리기
    this.updateAndDrawFloatingTexts(ctx);

    ctx.restore();
  }

  // 배경 베이스 렌더링
  drawBackground(ctx) {
    // 맵 베이스
    ctx.fillStyle = '#090d14';
    ctx.fillRect(this.offsetX, this.offsetY, this.cols * this.cellSize, this.rows * this.cellSize);

    // 은은한 그리드 라인
    ctx.strokeStyle = '#152232';
    ctx.lineWidth = 1;

    for (let c = 0; c <= this.cols; c++) {
      const x = this.offsetX + c * this.cellSize;
      ctx.beginPath();
      ctx.moveTo(x, this.offsetY);
      ctx.lineTo(x, this.offsetY + this.rows * this.cellSize);
      ctx.stroke();
    }

    for (let r = 0; r <= this.rows; r++) {
      const y = this.offsetY + r * this.cellSize;
      ctx.beginPath();
      ctx.moveTo(this.offsetX, y);
      ctx.lineTo(this.offsetX + this.cols * this.cellSize, y);
      ctx.stroke();
    }
  }

  // 좌표축 레이블 (1~30, A~T)
  drawAxisLabels(ctx) {
    ctx.font = '10px "Share Tech Mono", monospace';
    ctx.fillStyle = '#5c7893';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 상단 X축 (1~30)
    for (let c = 0; c < this.cols; c++) {
      const x = this.offsetX + c * this.cellSize + this.cellSize / 2;
      ctx.fillText(String(c + 1), x, this.offsetY / 2);
    }

    // 좌측 Y축 (A~T)
    const letters = 'ABCDEFGHIJKLMNOPQRST';
    for (let r = 0; r < this.rows; r++) {
      const y = this.offsetY + r * this.cellSize + this.cellSize / 2;
      ctx.fillText(letters[r] || String(r + 1), this.offsetX / 2, y);
    }
  }

  // 중앙 전선 분계선 (y=9 와 y=10 사이)
  drawFrontline(ctx) {
    const frontlineY = this.offsetY + 10 * this.cellSize;

    ctx.save();
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(this.offsetX, frontlineY);
    ctx.lineTo(this.offsetX + this.cols * this.cellSize, frontlineY);
    ctx.stroke();

    // 전선 텍스트 뱃지
    ctx.setLineDash([]);
    ctx.font = '9px "Orbitron", monospace';
    ctx.fillStyle = 'rgba(0, 229, 255, 0.7)';
    ctx.textAlign = 'left';
    ctx.fillText('◄ ENEMY TERRITORY (적 진영)', this.offsetX + 8, frontlineY - 6);
    ctx.fillText('◄ FRIENDLY TERRITORY (아군 진영)', this.offsetX + 8, frontlineY + 12);
    ctx.restore();
  }

  // 산(Mountain) 지형 렌더링
  drawMountains(ctx, mountains) {
    if (!mountains) return;

    mountains.forEach(m => {
      const x = this.offsetX + m.c * this.cellSize;
      const y = this.offsetY + m.r * this.cellSize;

      // 산 베이스 색상
      ctx.fillStyle = '#374151';
      ctx.fillRect(x + 1, y + 1, this.cellSize - 2, this.cellSize - 2);

      // 입체적인 암벽 산등성이 형태
      ctx.fillStyle = '#4b5563';
      ctx.beginPath();
      ctx.moveTo(x + 2, y + this.cellSize - 2);
      ctx.lineTo(x + this.cellSize / 2, y + 3);
      ctx.lineTo(x + this.cellSize - 2, y + this.cellSize - 2);
      ctx.closePath();
      ctx.fill();

      // 산 정상 만년설/명암
      ctx.fillStyle = '#9ca3af';
      ctx.beginPath();
      ctx.moveTo(x + this.cellSize / 2 - 3, y + 7);
      ctx.lineTo(x + this.cellSize / 2, y + 3);
      ctx.lineTo(x + this.cellSize / 2 + 3, y + 7);
      ctx.closePath();
      ctx.fill();

      // 테두리
      ctx.strokeStyle = '#6b7280';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 1, y + 1, this.cellSize - 2, this.cellSize - 2);
    });
  }

  // 아군 진영 부대 렌더링
  drawPlayerUnits(ctx, gameState) {
    // 1. 아군 진영 공터 피격 칸 (이미 포격받은 곳) 밝은 크레이터 렌더링
    for (let r = 10; r < 20; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = gameState.playerGrid[r - 10][c];
        if (cell.isHit && !cell.unit) {
          const x = this.offsetX + c * this.cellSize;
          const y = this.offsetY + r * this.cellSize;

          ctx.fillStyle = '#384b66'; // 밝은 연청회색 베이스
          ctx.fillRect(x + 1, y + 1, this.cellSize - 2, this.cellSize - 2);

          ctx.strokeStyle = '#64748b';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 1, y + 1, this.cellSize - 2, this.cellSize - 2);

          ctx.fillStyle = '#94a3b8';
          ctx.beginPath();
          ctx.arc(x + this.cellSize / 2, y + this.cellSize / 2, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    const units = gameState.playerUnits;

    units.forEach(unit => {
      const isDead = unit.isDestroyed;

      for (let r = 0; r < unit.height; r++) {
        for (let c = 0; c < unit.width; c++) {
          const gridC = unit.col + c;
          const gridR = unit.row + r;
          const x = this.offsetX + gridC * this.cellSize;
          const y = this.offsetY + gridR * this.cellSize;

          const hp = unit.cells[r][c];

          if (isDead) {
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(x + 1, y + 1, this.cellSize - 2, this.cellSize - 2);
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 1, y + 1, this.cellSize - 2, this.cellSize - 2);
          } else if (hp === 0) {
            // 피격 파괴된 칸: 밝은 레드/오렌지
            ctx.fillStyle = '#991b1b';
            ctx.fillRect(x + 1, y + 1, this.cellSize - 2, this.cellSize - 2);
            this.drawDestroyedCross(ctx, x, y);
          } else {
            // 살아있는 칸
            if (unit.type === 'HQ') {
              ctx.fillStyle = '#065f46';
            } else if (unit.type === 'MORTAR') {
              ctx.fillStyle = '#155e75';
            } else if (unit.type.startsWith('MG')) {
              ctx.fillStyle = '#4338ca'; // 기관총 진지 보라/남색
            } else {
              ctx.fillStyle = '#166534';
            }
            ctx.fillRect(x + 1, y + 1, this.cellSize - 2, this.cellSize - 2);

            // 본부 HQ 아이콘 표시
            if (unit.type === 'HQ') {
              ctx.fillStyle = '#34d399';
              ctx.font = 'bold 8px "Share Tech Mono", monospace';
              ctx.textAlign = 'center';
              ctx.fillText('HQ', x + this.cellSize / 2, y + this.cellSize / 2 + 3);
            } else if (unit.type.startsWith('MG')) {
              ctx.fillStyle = '#a5b4fc';
              ctx.font = 'bold 8px "Share Tech Mono", monospace';
              ctx.textAlign = 'center';
              ctx.fillText('MG', x + this.cellSize / 2, y + this.cellSize / 2 + 3);
            }

            // 고지대 보너스 표기 (산 인접)
            if (unit.hasHighGround && r === 0 && c === 0) {
              ctx.fillStyle = '#fbbf24';
              ctx.font = '8px "Orbitron", monospace';
              ctx.fillText('▲고지', x + 12, y + 9);
            }

            // 사각지대 차폐 보호 표기
            if (unit.blindSpotCells && unit.blindSpotCells[r][c]) {
              ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
              ctx.fillRect(x + 2, y + 2, 6, 6);
            }
          }
        }
      }

      // 부대 전체 외곽 테두리
      const ux = this.offsetX + unit.col * this.cellSize;
      const uy = this.offsetY + unit.row * this.cellSize;
      const uw = unit.width * this.cellSize;
      const uh = unit.height * this.cellSize;

      ctx.strokeStyle = isDead ? '#ef4444' : '#10b981';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(ux + 0.5, uy + 0.5, uw - 1, uh - 1);

      // 유닛 이름 레이블
      ctx.font = 'bold 9px "Noto Sans KR", sans-serif';
      ctx.fillStyle = isDead ? '#ef4444' : '#6ee7b7';
      ctx.textAlign = 'left';
      ctx.fillText(unit.name, ux + 3, uy + 10);
    });

    // 배치 모드 중 선택된 부대 프리뷰 커서
    if (gameState.phase === 'PLACEMENT' && gameState.selectedUnitToPlace) {
      this.drawPlacementPreview(ctx, gameState);
    }
  }

  // 배치 미리보기 커서
  drawPlacementPreview(ctx, gameState) {
    if (this.hoverCol < 0 || this.hoverRow < 10) return; // 아군 영역(10~19)만 가능

    const u = gameState.selectedUnitToPlace;
    const w = u.currentW;
    const h = u.currentH;

    const isValid = gameState.isValidPlacement(this.hoverCol, this.hoverRow, w, h);

    const px = this.offsetX + this.hoverCol * this.cellSize;
    const py = this.offsetY + this.hoverRow * this.cellSize;

    ctx.fillStyle = isValid ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)';
    ctx.fillRect(px, py, w * this.cellSize, h * this.cellSize);

    ctx.strokeStyle = isValid ? '#10b981' : '#ef4444';
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, w * this.cellSize, h * this.cellSize);
  }

  // 적군 진영 안개 및 피격/조명탄 스캔 상태 렌더링
  drawEnemyArea(ctx, gameState) {
    // 안개 기본 덮개
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = this.offsetX + c * this.cellSize;
        const y = this.offsetY + r * this.cellSize;

        const cellState = gameState.enemyGrid[r][c];
        const isRevealedByFlare = gameState.flareScannedGrid[r][c];

        // 1. 조명탄으로 밝혀진 경우
        if (isRevealedByFlare && cellState.unit && !cellState.isHit) {
          ctx.fillStyle = 'rgba(245, 158, 11, 0.25)';
          ctx.fillRect(x + 1, y + 1, this.cellSize - 2, this.cellSize - 2);

          // 적 유닛 실루엣 표시
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 2, y + 2, this.cellSize - 4, this.cellSize - 4);
          ctx.fillStyle = '#fbbf24';
          ctx.font = '8px "Share Tech Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText('RADAR', x + this.cellSize / 2, y + this.cellSize / 2 + 3);
          continue;
        }

        // 2. 이미 피격된 칸 (Hit or Miss - 이미 포격한 곳을 확연히 밝은 색으로 렌더링)
        if (cellState.revealed) {
          if (cellState.unit) {
            // 유닛 명중: 밝고 선명한 오렌지-레드 화염 타일
            ctx.fillStyle = '#dc2626';
            ctx.fillRect(x + 1, y + 1, this.cellSize - 2, this.cellSize - 2);

            ctx.strokeStyle = '#f87171';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x + 2, y + 2, this.cellSize - 4, this.cellSize - 4);

            // 완파 크로스 표시
            this.drawDestroyedCross(ctx, x, y);
          } else {
            // 공터 빗나감 (이미 포격한 곳): 어두운 안개와 확연히 대비되는 밝은 연청회색 탄흔 지형
            ctx.fillStyle = '#384b66'; // 훨씬 밝은 연청회색 베이스
            ctx.fillRect(x + 1, y + 1, this.cellSize - 2, this.cellSize - 2);

            ctx.strokeStyle = '#64748b';
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 1, y + 1, this.cellSize - 2, this.cellSize - 2);

            // 밝은 크레이터 분화구
            ctx.fillStyle = '#94a3b8';
            ctx.beginPath();
            ctx.arc(x + this.cellSize / 2, y + this.cellSize / 2, 4.5, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#e2e8f0';
            ctx.beginPath();
            ctx.arc(x + this.cellSize / 2, y + this.cellSize / 2, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          // 전장의 안개 (게임 종료 시 완료된 전장 화면을 위해 생존 유닛 및 지형 공개)
          if (gameState.phase === 'GAMEOVER') {
            if (cellState.unit) {
              // 게임 종료 시 생존한 적 유닛 구역 (황금빛 위치 공개)
              ctx.fillStyle = 'rgba(234, 179, 8, 0.35)';
              ctx.fillRect(x + 1, y + 1, this.cellSize - 2, this.cellSize - 2);
              ctx.strokeStyle = '#eab308';
              ctx.lineWidth = 1;
              ctx.strokeRect(x + 2, y + 2, this.cellSize - 4, this.cellSize - 4);
            } else {
              // 게임 종료 시 미타격 공터 (은은하게 밝혀진 지형)
              ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
              ctx.fillRect(x + 1, y + 1, this.cellSize - 2, this.cellSize - 2);
            }
          } else {
            ctx.fillStyle = 'rgba(6, 11, 18, 0.75)';
            ctx.fillRect(x + 1, y + 1, this.cellSize - 2, this.cellSize - 2);
          }
        }
      }
    }

    // 적 부대 외곽선 표시 (완파된 적 부대 + 게임 종료 시 생존 적 부대 위치)
    gameState.enemyUnits.forEach(unit => {
      const ux = this.offsetX + unit.col * this.cellSize;
      const uy = this.offsetY + unit.row * this.cellSize;
      const uw = unit.width * this.cellSize;
      const uh = unit.height * this.cellSize;

      if (unit.isDestroyed) {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.strokeRect(ux + 1, uy + 1, uw - 2, uh - 2);

        // 완파 스탬프
        ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
        ctx.fillRect(ux + 1, uy + 1, uw - 2, uh - 2);

        ctx.fillStyle = '#f87171';
        ctx.font = 'bold 10px "Orbitron", "Noto Sans KR", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(unit.name + ' 완파', ux + uw / 2, uy + uh / 2 + 3);
      } else if (gameState.phase === 'GAMEOVER') {
        // 게임 종료 시 살아남은 적 부대 배치 공개
        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(ux + 1, uy + 1, uw - 2, uh - 2);

        ctx.fillStyle = 'rgba(234, 179, 8, 0.15)';
        ctx.fillRect(ux + 1, uy + 1, uw - 2, uh - 2);

        ctx.fillStyle = '#fef08a';
        ctx.font = 'bold 9px "Orbitron", "Noto Sans KR", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(unit.name + ' (생존 위치)', ux + uw / 2, uy + uh / 2 + 3);
      }
    });
  }

  // 십자 흙먼지 흔적 (Cross Splash Markers) 렌더링
  drawSplashMarkers(ctx, gameState) {
    const list = gameState.splashMarkers;
    if (!list) return;

    list.forEach(m => {
      const x = this.offsetX + m.c * this.cellSize;
      const y = this.offsetY + m.r * this.cellSize;

      // 흙먼지 십자 타일 위에 은은한 오렌지/더스트 마커
      ctx.save();
      ctx.fillStyle = m.hasEnemyNear ? 'rgba(245, 158, 11, 0.22)' : 'rgba(148, 163, 184, 0.12)';
      ctx.fillRect(x + 1, y + 1, this.cellSize - 2, this.cellSize - 2);

      // 적 반응 감지 시 경고 점
      if (m.hasEnemyNear) {
        const pulse = (Math.sin(this.time * 6) + 1) / 2;
        ctx.fillStyle = `rgba(245, 158, 11, ${0.4 + pulse * 0.5})`;
        ctx.beginPath();
        ctx.arc(x + this.cellSize / 2, y + this.cellSize / 2, 3 + pulse * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
  }

  // 플레이어가 지정한 다중 타겟 조준 마커 그리기
  drawTargetMarkers(ctx, gameState) {
    if (gameState.phase !== 'BATTLE' || gameState.turn !== 'PLAYER') return;

    gameState.selectedTargets.forEach((t, idx) => {
      const x = this.offsetX + t.c * this.cellSize;
      const y = this.offsetY + t.r * this.cellSize;
      const cx = x + this.cellSize / 2;
      const cy = y + this.cellSize / 2;

      ctx.save();

      // 조준 링
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, this.cellSize / 2 - 3, 0, Math.PI * 2);
      ctx.stroke();

      // 십자선
      ctx.beginPath();
      ctx.moveTo(cx - 5, cy);
      ctx.lineTo(cx + 5, cy);
      ctx.moveTo(cx, cy - 5);
      ctx.lineTo(cx, cy + 5);
      ctx.stroke();

      // 발사 순번 뱃지 (1, 2, 3...)
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(cx + 8, cy - 8, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px "Orbitron", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(idx + 1), cx + 8, cy - 8);

      ctx.restore();
    });
  }

  // 마우스 호버 하이라이트
  drawHover(ctx, gameState) {
    if (this.hoverCol < 0 || this.hoverCol >= this.cols || this.hoverRow < 0 || this.hoverRow >= this.rows) return;

    const x = this.offsetX + this.hoverCol * this.cellSize;
    const y = this.offsetY + this.hoverRow * this.cellSize;

    if (gameState.phase === 'BATTLE') {
      if (gameState.isFlareMode) {
        // 조명탄 조준 범위 프리뷰 (3x3 또는 5x5)
        const rad = gameState.flareRadius;
        const startC = Math.max(0, this.hoverCol - rad);
        const endC = Math.min(this.cols - 1, this.hoverCol + rad);
        const startR = Math.max(0, this.hoverRow - rad);
        const endR = Math.min(9, this.hoverRow + rad);

        const fx = this.offsetX + startC * this.cellSize;
        const fy = this.offsetY + startR * this.cellSize;
        const fw = (endC - startC + 1) * this.cellSize;
        const fh = (endR - startR + 1) * this.cellSize;

        ctx.fillStyle = 'rgba(251, 191, 36, 0.25)';
        ctx.fillRect(fx, fy, fw, fh);
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.strokeRect(fx, fy, fw, fh);
      } else if (this.hoverRow < 10) {
        // 적 진영 타겟 호버 박스
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 1, y + 1, this.cellSize - 2, this.cellSize - 2);
      }
    }
  }

  // 조명탄 투하 및 지속 연출
  drawFlares(ctx) {
    for (let i = this.flares.length - 1; i >= 0; i--) {
      const f = this.flares[i];
      f.life--;
      f.alpha = f.life / f.maxLife;

      if (f.life <= 0) {
        this.flares.splice(i, 1);
        continue;
      }

      ctx.save();
      // 광원 원형 그라디언트
      const pixelRad = (f.radius * 2 + 1) * this.cellSize * 0.8;
      const grad = ctx.createRadialGradient(f.x, f.y, 10, f.x, f.y, pixelRad);
      grad.addColorStop(0, `rgba(254, 240, 138, ${0.45 * f.alpha})`);
      grad.addColorStop(0.7, `rgba(245, 158, 11, ${0.2 * f.alpha})`);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(f.x, f.y, pixelRad, 0, Math.PI * 2);
      ctx.fill();

      // 상공의 조명탄 본체
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(f.x, f.y - 12 + Math.sin(this.time * 5) * 2, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // 소형 탄환 탄착 스파크 (기관총용)
  createBulletHitSpark(x, y) {
    this.triggerShake(1.5);
    for (let i = 0; i < 7; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 1.5 + Math.random() * 3.5;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 0.5,
        size: 1.5 + Math.random() * 1.5,
        color: Math.random() > 0.5 ? '#f59e0b' : '#fbbf24',
        alpha: 1,
        decay: 0.05,
        gravity: 0.08
      });
    }
  }

  // 포탄 및 기관총 탄환 비행 궤적 & 렌더링
  updateAndDrawProjectiles(ctx) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.progress += p.speed;

      // 궤적 현재 2D 위치 (보간)
      const currentX = p.startX + (p.targetX - p.startX) * p.progress;
      const currentGroundY = p.startY + (p.targetY - p.startY) * p.progress;

      // 포물선 z고도: h(t) = 4 * maxH * t * (1-t)
      const altitude = 4 * p.heightMax * p.progress * (1 - p.progress);
      const currentY = currentGroundY - altitude;

      // 비행 방향 각도 계산
      const prevX = p.prevX !== undefined ? p.prevX : currentX - (p.targetX - p.startX) * 0.05;
      const prevY = p.prevY !== undefined ? p.prevY : currentY - (p.targetY - p.startY) * 0.05;
      const angle = Math.atan2(currentY - prevY, currentX - prevX);
      p.prevX = currentX;
      p.prevY = currentY;

      // ---------------- 1. 기관총 예광탄 (MG_BULLET) ----------------
      if (p.type === 'MG_BULLET') {
        // 기관총 예광 트레일 (황금빛 레이저 빔)
        p.trail.push({ x: currentX, y: currentY });
        if (p.trail.length > 5) p.trail.shift();

        ctx.save();
        p.trail.forEach((tr, tIdx) => {
          const alpha = (tIdx / p.trail.length) * 0.7;
          ctx.strokeStyle = `rgba(251, 191, 36, ${alpha})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(tr.x, tr.y, 1.5, 0, Math.PI * 2);
          ctx.stroke();
        });

        // 예광탄 본체 (고속 황금빛 탄환 캡슐)
        ctx.translate(currentX, currentY);
        ctx.rotate(angle);
        ctx.fillStyle = '#fef08a';
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.ellipse(0, 0, 6, 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 탄착 판정
        if (p.progress >= 1) {
          this.projectiles.splice(i, 1);
          if (p.isLastBullet) {
            // 마지막 6번째 탄환: 메인 착탄 폭발 및 로직 실행
            this.createExplosion(p.targetX, p.targetY, p.isHit, p.isBlindSpot);
            if (p.onImpact) p.onImpact();
          } else {
            // 중간 연사 탄환: 소형 탄착 스파크
            this.createBulletHitSpark(p.targetX, p.targetY);
          }
        }
        continue;
      }

      // ---------------- 2. 81mm 대형 박격포 고폭탄 (81MM_SHELL) ----------------
      // 꼬리 불꽃 분출 파티클 (Thrust Flame & Sparks Trail)
      const tailX = currentX - Math.cos(angle) * 11;
      const tailY = currentY - Math.sin(angle) * 11;

      for (let k = 0; k < 2; k++) {
        const flameSpd = 1.8 + Math.random() * 2.2;
        const spreadAngle = angle + Math.PI + (Math.random() - 0.5) * 0.6;
        this.particles.push({
          x: tailX,
          y: tailY,
          vx: Math.cos(spreadAngle) * flameSpd,
          vy: Math.sin(spreadAngle) * flameSpd,
          size: 2.5 + Math.random() * 3.5,
          color: Math.random() > 0.35 ? '#f97316' : '#fde047',
          alpha: 0.9,
          decay: 0.045,
          gravity: 0.02
        });
      }

      // 지면 그림자 (고도에 따라 크기/투명도 변화)
      ctx.save();
      const shadowScale = Math.max(0.2, 1 - (altitude / p.heightMax) * 0.4);
      ctx.fillStyle = `rgba(0, 0, 0, ${0.4 * shadowScale})`;
      ctx.beginPath();
      ctx.ellipse(currentX, currentGroundY, 6 * shadowScale, 3 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();

      // 81mm 박격포 고폭탄 외형 정밀 렌더링 (대형 눈물방울형 탄두 + 날개 핀)
      ctx.translate(currentX, currentY);
      ctx.rotate(angle);

      // 탄미 노즐 발광 불꽃
      ctx.fillStyle = '#ff6b00';
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(-10, 0, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // 1. 꼬리 테일 붐 & 안정 날개 핀 (Tail Fin Assembly)
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(-11, -2, 5, 4); // 꼬리 파이프

      // 꼬리 십자 핀 날개 (4개 핀)
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.moveTo(-11, -6);
      ctx.lineTo(-7, -2);
      ctx.lineTo(-7, 2);
      ctx.lineTo(-11, 6);
      ctx.lineTo(-10, 0);
      ctx.closePath();
      ctx.fill();

      // 2. 고폭탄 몸체 (유선형 눈물방울 메탈/올리브 드랩 바디)
      ctx.fillStyle = '#3f4f34';
      ctx.beginPath();
      ctx.moveTo(-6, -3.5);
      ctx.quadraticCurveTo(2, -5.5, 7, -2.5);
      ctx.lineTo(10, 0); // 뾰족한 앞부분
      ctx.lineTo(7, 2.5);
      ctx.quadraticCurveTo(2, 5.5, -6, 3.5);
      ctx.closePath();
      ctx.fill();

      // 탄체 하이라이트 명암 림
      ctx.strokeStyle = '#65a30d';
      ctx.lineWidth = 1;
      ctx.stroke();

      // 3. 황금색 고폭탄 식별 밴드 (HE Band)
      ctx.fillStyle = '#eab308';
      ctx.fillRect(-1, -4.5, 2.5, 9);

      // 4. 탄두 충격 신관 (Fuze Tip)
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.moveTo(8, -2);
      ctx.lineTo(12, 0);
      ctx.lineTo(8, 2);
      ctx.closePath();
      ctx.fill();

      ctx.restore();

      // 착탄 완료 판정
      if (p.progress >= 1) {
        this.projectiles.splice(i, 1);
        this.createExplosion(p.targetX, p.targetY, p.isHit, p.isBlindSpot);
        if (p.onImpact) {
          p.onImpact();
        }
      }
    }
  }

  // 파티클 업데이트 및 렌더링
  updateAndDrawParticles(ctx) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.vy += pt.gravity;
      pt.alpha -= pt.decay;

      if (pt.alpha <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0, pt.alpha);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // 플로팅 텍스트 업데이트 및 그리기
  updateAndDrawFloatingTexts(ctx) {
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y += ft.vy;
      ft.alpha -= 0.02;

      if (ft.alpha <= 0) {
        this.floatingTexts.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0, ft.alpha);
      ctx.font = 'bold 12px "Noto Sans KR", sans-serif';
      ctx.fillStyle = ft.color;
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }
  }

  // 파괴 표시 X 마커
  drawDestroyedCross(ctx, x, y) {
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 5, y + 5);
    ctx.lineTo(x + this.cellSize - 5, y + this.cellSize - 5);
    ctx.moveTo(x + this.cellSize - 5, y + 5);
    ctx.lineTo(x + 5, y + this.cellSize - 5);
    ctx.stroke();
  }

  // 마우스 좌표를 그리드 (col, row)로 변환
  getGridPos(canvasX, canvasY) {
    const col = Math.floor((canvasX - this.offsetX) / this.cellSize);
    const row = Math.floor((canvasY - this.offsetY) / this.cellSize);

    if (col >= 0 && col < this.cols && row >= 0 && row < this.rows) {
      return { col, row };
    }
    return null;
  }
}
