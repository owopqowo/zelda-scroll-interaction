import React, {useState, useEffect, useCallback, useRef} from 'react';
import AppLayout from '../components/appLayout';
import Gallery from '../components/gallery';
import StickySection from "../components/main/stickySection";
import styles from '../public/css/pages/index.module.css';
import path from 'path';
import fs from 'fs';

// TODO: constants 정의 필요
const PUBLIC = 'public';
const VIDEO_PATH = '/images/video';
const HEIGHT_NUM = 5;

const Main = ({sceneInfoList}) => {
  const [sceneInfos, setSceneInfos] = useState([]); // scene object list
  const [layoutData, setLayoutData] = useState({
    yOffset: 0,           // 현재 스크롤 값 설정
    prevScrollHeight: 0,  // 현재 스크롤 값(yOffset)보다 이전에 위치한 섹션 높이의 합
    currentScene: 0,      // 현재 활성화된 (보이는) 섹션
    enterNewScene: false, // 새로운 scene이 시작되는 순간 true
    acc: 0.1,             // 0.1 만큼 애니메이션 감속
    delayedYOffset: 0,    // 지연된 yOffset
    rafId: null,          // requestAnimationFrame 적용
    rafState: false,      // requestAnimationFrame 상태
  });

  // init
  useEffect(() => {
    const sections = document.getElementsByTagName('section');

    /** set data */
    sceneInfoList.map((sceneInfo, i) => {
      // set scene type & objs
      const section = sections[i];
      sceneInfo.sceneType = section.dataset.sceneType;
      sceneInfo.objs.container = section;
      sceneInfo.objs.canvas = document.getElementsByTagName('canvas')[i];
      sceneInfo.objs.context = document.getElementsByTagName('canvas')[i] !== undefined
        ? document.getElementsByTagName('canvas')[i].getContext('2d')
        : null;

      // set scene values
      sceneInfo.values.imageSequence = [0, sceneInfo.imageLength - 1, {start: 0, end: 0.8}]

      // set scene image element
      let imageElems = [];
      for (let i = 0; i < sceneInfo.imageLength; i++) {
        let imgElem = document.createElement('img');
        imgElem.src = `${VIDEO_PATH}/${sceneInfo.sceneName}/${sceneInfo.imagesNames[i]}`;
        imageElems.push(imgElem);
      }
      sceneInfo.objs.imageElems = imageElems;

      // 각 섹션의 높이 설정
      switch (sceneInfo.sceneType) {
        case "sticky":
          sceneInfo.scrollHeight = HEIGHT_NUM * window.innerHeight;
          break;
        case "normal":
          sceneInfo.scrollHeight = sceneInfo.objs.container.offsetHeight;
          break;
        default:
          sceneInfo.scrollHeight = sceneInfo.objs.container.offsetHeight;
          break;
      }
      sceneInfo.objs.container.style.height = `${sceneInfo.scrollHeight}px`;
    });

    /** set layout */
      // 페이지 중간에서 새로고침 했을 경우의 currentScene 설정
    let totalScrollHeight = 0;
    let currentSceneIndex = 0;
    for (let i = 0; i < sceneInfoList.length; i++) {
      totalScrollHeight += sceneInfoList[i].scrollHeight;

      if (totalScrollHeight >= window.pageYOffset) {
        currentSceneIndex = i;
        break;
      }
    }

    document.body.setAttribute('id', `show-scene-${currentSceneIndex}`);

    // canvas 비율 설정 (height 100%, center 정렬)
    const heightRatio = window.innerHeight / 1080;
    sceneInfoList[0].objs.canvas.style.transform = `translate3d(-50%, -50%, 0) scale(${heightRatio})`;
    // sceneInfo[2].objs.canvas.style.transform = `translate3d(-50%, -50%, 0) scale(${heightRatio})`;

    sceneInfoList[0].objs.context.drawImage(sceneInfoList[0].objs.imageElems[0], 0, 0);

    // data setting
    setSceneInfos(sceneInfoList);
    setLayoutData(prev => {
      return {
        ...prev,
        yOffset: window.pageYOffset,
        currentScene: currentSceneIndex
      }
    });
  }, []);

  // scroll event
  useEffect(() => {
    // TODO: Intersection Observer 확인 더 해보고 적용
    if (sceneInfos.length !== 0) {
      window.addEventListener('scroll', scrollLoop, {passive: true});
      return () => window.removeEventListener('scroll', scrollLoop);
    }
  }, [sceneInfos, layoutData]);

  const scrollLoop = () => {
    console.log('scroll Loop')
    const layout = {...layoutData};

    layout.yOffset = window.pageYOffset;
    layout.enterNewScene = false;
    layout.prevScrollHeight = 0;

    for (let i = 0; i < layoutData.currentScene; i++) {
      layout.prevScrollHeight += sceneInfos[i].scrollHeight;
    }

    // 정확한 계산을 위해 기존 yOffset 대신 delayedYOffset 으로 교체
    if (layout.delayedYOffset > layout.prevScrollHeight + sceneInfos[layout.currentScene].scrollHeight) {
      layout.enterNewScene = true;
      layout.currentScene++;
      // body의 id값에 따라 css에서 sticky-elem의 show / hide 설정
      document.body.setAttribute('id', `show-scene-${layout.currentScene}`);
    } else if (layout.delayedYOffset < layout.prevScrollHeight) {
      layout.enterNewScene = true;
      if (layout.currentScene === 0) return;   // 브라우저 바운스 효과로 currentScene가 - 값이 되는 것을 방지
      layout.currentScene--;
      document.body.setAttribute('id', `show-scene-${layout.currentScene}`);
    }

    // // scene이 변경되는 순간은 palyAni 함수 실행 X (변경되는 순간 출력되는 음수값 때문에)
    // if (!layout.enterNewScene) {
    //   playAni();
    // }

    if (!layout.rafState) {
      layout.rafId = requestAnimationFrame(loop(layout));
      layout.rafState = true;
    }

    setLayoutData(layout);
  };

  const loop = (prevLayout) => () => {
    const layout = {...prevLayout};
    const tempSceneInfos = [...sceneInfos];
    layout.delayedYOffset = layout.delayedYOffset + (layout.yOffset - layout.delayedYOffset) * layout.acc;

    // scene이 변경되지 않는 동안에만 적용
    if (!layout.enterNewScene) {
      // scene 0 에서만 적용
      if (layout.currentScene === 0) {
        // 기존 yOffset 대신 감속효과 적용된 delayedYOffset 으로 교체
        const currentYOffset = layout.delayedYOffset - layout.prevScrollHeight;
        const objs = sceneInfos[layout.currentScene].objs;
        const imageSequence = sceneInfos[layout.currentScene].values.imageSequence;
        let sequence = Math.round(calcVal(imageSequence, currentYOffset));
        if (objs.imageElems[sequence]) {
          tempSceneInfos[layout.currentScene].objs.context.drawImage(objs.imageElems[sequence], 0, 0);
          setSceneInfos(tempSceneInfos)
        }
      }
    }

    layout.rafId = requestAnimationFrame(loop(layout));

    if (Math.abs(layout.yOffset - layout.delayedYOffset) < 1) {
      console.log("@@")
      cancelAnimationFrame(layout.rafId);
      layout.rafState = false;
      setLayoutData(layout);
    } else {
      console.log("!!!!")
      setLayoutData(layout);
    }
  };

  // val : 애니메이션 효과의 시작, 끝, 애니메이션 구간의 배열 / currentYOffset : 현재 scene의 스크롤 위치
  function calcVal(val, currentYOffset) {
    let rv;
    const scrollHeight = sceneInfos[layoutData.currentScene].scrollHeight;
    const scrollRatio = currentYOffset / scrollHeight; // %값 (현재 scene의 스크롤 위치 / 현재 scene의 높이)

    if (val.length >= 3) {
      const partScrollStart = val[2].start * scrollHeight; // 시작값 px
      const partScrollEnd = val[2].end * scrollHeight; // 종료값 px
      const partScrollHeight = partScrollEnd - partScrollStart; // 애니메이션 구간

      if (currentYOffset >= partScrollStart && currentYOffset <= partScrollEnd) {
        rv = (currentYOffset - partScrollStart) / partScrollHeight * (val[1] - val[0]) + val[0];
      } else if (currentYOffset < partScrollStart) {
        rv = val[0];
      } else if (currentYOffset > partScrollEnd) {
        rv = val[1];
      }
    } else {
      rv = scrollRatio * (val[1] - val[0]) + val[0];
    }

    return rv;
  }

  // function playAni (){
  //   console.log('playAni');
  //   const objs = sceneInfos[layoutData.currentScene].objs;
  //   const values = sceneInfos[layoutData.currentScene].values;
  //   const currentYOffset = layoutData.yOffset - layoutData.prevScrollHeight;
  //   const scrollHeight = sceneInfos[layoutData.currentScene].scrollHeight;
  //   const scrollRatio = currentYOffset / scrollHeight;
  //
  //   switch (layoutData.currentScene) {
  //     case 0:
  //       // 부드러운 애니메이션 적용을 위해 loop 함수 안으로 이동
  //       // let sequence = Math.round(calcVal(values.imageSequence, currentYOffset));
  //       // objs.context.drawImage(objs.videoImages[sequence], 0, 0);
  //       break;
  //     case 1:
  //       break;
  //     case 2:
  //       // // out
  //       // objs.imgLInk.style.opacity = calcVal(values.link_opacity_out, currentYOffset);
  //       // objs.nameLink.style.transform = `translate3d(0, ${calcVal(values.link_translateY_out, currentYOffset)}%, 0)`;
  //       //
  //       // // in
  //       // objs.imgZelda.style.opacity = calcVal(values.zelda_opacity_in, currentYOffset);
  //       // objs.nameZelda.style.transform = `translate3d(0, ${calcVal(values.zelda_translateY_in, currentYOffset)}%, 0)`;
  //       break;
  //     default:
  //       break;
  //   }
  // };

  useEffect(() => {
    // console.log(sceneInfos)
  });

  return (
    <AppLayout>
      <StickySection/>
      {/*<section className={styles.section1} data-scene-type='sticky'>*/}
      {/*  <h2 className={styles.title}>The Legend of &nbsp;Zelda<br/>Breath of the Wild</h2>*/}
      {/*  <div className={styles.sticky}>*/}
      {/*    <canvas id="vidio-canvas-0" width="1920" height="1080" className={styles.canvas}></canvas>*/}
      {/*  </div>*/}
      {/*</section>*/}
      <section className={styles.section2} data-scene-type='normal'>
        <p className={styles.desc}>
          <strong className={styles.point}>Lorem</strong> ipsum dolor sit amet, <br/>consectetur adipiscing elit. <br/>Sed
          pellentesque eros magna, <br/>ac ultrices nulla accumsan in.
        </p>
        <Gallery/>
      </section>
      <section className={styles.section3} data-scene-type='sticky'>
        <h2 className={styles.title}>Calamity Ganon</h2>
        <img src="/images/video/001_intro/zelda 001.jpg" alt=""/>
      </section>
      <section className={styles.section3} data-scene-type='normal'>
        <h2 className={styles.title}>Color Change</h2>
      </section>
      <section className={styles.section3} data-scene-type='normal'>
        <h2 className={styles.title}>Ending</h2>
        <img src="/images/video/001_intro/zelda 001.jpg" alt=""/>
      </section>
    </AppLayout>
  )
};

export async function getStaticProps() {
  // process.cwd()는 nextjs 에서 제공하는 __dirname과 같은 루트값
  // fs객체는 ssr을 통해 접근이 가능해 getStaticProps로 파일 정보 수집을 먼저 함
  const sceneInfoList = [];
  const videosDirectory = fs.readdirSync(path.join(process.cwd(), PUBLIC, VIDEO_PATH));
  videosDirectory.map(v => {
    const imageNames = fs.readdirSync(path.join(process.cwd(), PUBLIC, VIDEO_PATH, v));

    sceneInfoList.push({
      sceneName: v,
      sceneType: '',
      imageLength: imageNames.length,
      imagesNames: imageNames,
      scrollHeight: 0,
      objs: {},
      values: {}
    })
  });

  return {
    props: {
      sceneInfoList
    }
  }
}

export default Main;