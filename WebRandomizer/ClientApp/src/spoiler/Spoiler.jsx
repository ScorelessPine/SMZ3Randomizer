﻿import React, { useEffect, useState } from 'react';
import { Row, Col, Card, CardHeader, CardBody, Nav, NavItem, Input, Button } from 'reactstrap';
import InputGroup from '../ui/PrefixInputGroup';
import { SmallNavLink, StyledTable } from './styled';

import { SearchIcon, DownloadIcon } from './styled';

import { saveAs } from 'file-saver';
import { encode } from 'slugid';

import { tryParseJson, sortGroupBy } from '../util';
import map from 'lodash/map';
import filter from 'lodash/filter';
import some from 'lodash/some';
import includes from 'lodash/includes';
import sortBy from 'lodash/sortBy';
import uniq from 'lodash/uniq';
import initial from 'lodash/initial';
import last from 'lodash/last';
import toPairs from 'lodash/toPairs';
import isEmpty from 'lodash/isEmpty';
import escapeRegExp from 'lodash/escapeRegExp';

export default function Spoiler({ seedGuid }) {
    const [show, setShow] = useState(false);
    const [spoiler, setSpoiler] = useState(null);
    const [searchText, setSearchText] = useState('');
    const [activeArea, setActiveArea] = useState('playthrough');
    const [areas, setAreas] = useState([]);
    const [content, setContent] = useState([]);

    async function toggleSpoiler() {
        if (!show && !spoiler) {
            try {
                const response = await fetch(`/api/spoiler/${seedGuid}`);
                const data = await response.json();
                data.seed.spoiler = filter(tryParseJson(data.seed.spoiler), sphere => !isEmpty(sphere));
                data.locations = sortBy(data.locations, 'locationId');
                setSpoiler(data);
            } catch { }
        }

        setShow(show => !show);
    }

    function updateSearchText(value) {
        setSearchText(value);
        if (value && activeArea === 'playthrough') {
            setActiveArea('all');
        }
    }

    async function downloadSpoiler() {
        const { seed, locations } = spoiler;
        const { gameId, spoiler: playthrough } = seed;
        /* Prepare a human-readable JSON dump of the spoiler data */
        const s = {
            seed: { ...seed, spoiler: null },
            ...(gameId === 'smz3'
                ? { playthrough: initial(playthrough), prizes: last(playthrough) }
                : { playthrough }
            ),
            regions: sortBy(uniq(map(locations, 'locationRegion'))).map(r => {
                return {
                    region: r,
                    locations: locations.filter(l => l.locationRegion === r).map(l => {
                        return {
                            name: l.locationName,
                            item: l.itemName
                        };
                    })
                }
            })
        };

        const text = unescape(JSON.stringify(s, null, 4));

        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        saveAs(blob, `${seed.gameName} v${seed.gameVersion} - ${encode(seed.guid)} - Spoiler.txt`);
    }

    useEffect(() => {
        if (spoiler) {
            const { gameId, worlds, players, spoiler: playthrough } = spoiler.seed;
            let { locations } = spoiler;

            if (searchText) {
                const pattern = new RegExp(escapeRegExp(searchText), 'i');
                locations = filter(locations, l => pattern.test(l.locationName) || pattern.test(l.itemName));

                if (!includes(['playthrough', 'prizes', 'all'], activeArea) && !some(locations, { locationArea: activeArea })) {
                    /* Return early since this state change will reuse the effect */
                    setActiveArea('all');
                    return;
                }
            }

            if (activeArea === 'playthrough') {
                setContent(gameId === 'smz3' ? [
                    ...sphereContent(initial(playthrough)),
                    ...prizeReqContent(last(playthrough))
                ] : sphereContent(playthrough));
            }
            else if (activeArea === 'prizes')
                setContent(prizeReqContent(last(playthrough)));
            else
                setContent(areaContent(locations, worlds, players > 1));

            setAreas(uniq(map(locations, 'locationArea')));
        }
    }, [spoiler, searchText, activeArea]);

    function sphereContent(spheres) {
        return map(spheres, (sphere, i) => [`Sphere ${i + 1}`, toPairs(sphere)]);
    }

    function prizeReqContent(section) {
        return [['Prizes and Requirements', toPairs(section)]];
    }

    function areaContent(locations, worlds, multiworld) {
        const locationsInArea = filter(locations, activeArea !== 'all' ? { locationArea: activeArea } : {});
        const locationsByRegion = sortGroupBy(locationsInArea, 'locationRegion');
        return map(locationsByRegion, ([region, locations]) =>
            [region, map(locations, ({ locationName, worldId, itemName, itemWorldId }) => [
                multiworld ? `${locationName} - ${worlds[worldId].player}` : locationName,
                multiworld ? `${itemName} - ${worlds[itemWorldId].player}` : itemName,
            ])]
        );
    }

    return (
        <Card>
            <CardHeader>
                <Row className="align-items-center justify-content-between">
                    <Col>Spoiler log</Col>
                    <Col><Button outline className="float-right" color="secondary" onClick={toggleSpoiler}>{show ? 'Hide' : 'Show'}</Button></Col>
                </Row>
            </CardHeader>
            {show && <CardBody>
                {spoiler ? <div>
                    <Row>
                        <Col md="9">
                            <InputGroup className="mb-3" prefix={<SearchIcon />}>
                                <Input key="searchInput" placeholder="Find a location or item" value={searchText}
                                    onChange={e => updateSearchText(e.target.value)}
                                />
                            </InputGroup>
                        </Col>
                        <Col>
                            <Button outline color="primary" className="float-right" onClick={downloadSpoiler}><DownloadIcon /> Download</Button>
                        </Col>
                    </Row>
                    <div>
                        <Nav pills className="mb-2">
                            <NavItem>
                                <SmallNavLink href="#" active={activeArea === 'playthrough'} onClick={() => setActiveArea('playthrough')}>Playthrough</SmallNavLink>
                            </NavItem>
                            {spoiler.seed.gameId === 'smz3' && <NavItem>
                                <SmallNavLink href="#" active={activeArea === 'prizes'} onClick={() => setActiveArea('prizes')}>Prizes</SmallNavLink>
                            </NavItem>}
                            <NavItem>
                                <SmallNavLink href="#" active={activeArea === 'all'} onClick={() => setActiveArea('all')}>All</SmallNavLink>
                            </NavItem>
                            {map(areas, area => (
                                <NavItem key={area}>
                                    <SmallNavLink href="#" active={activeArea === area} onClick={() => setActiveArea(area)}>{area}</SmallNavLink>
                                </NavItem>
                            ))}
                        </Nav>
                        <Card>
                            <CardBody>
                                {map(content, ([title, entries]) => (
                                    <div key={title}>
                                        <h6>{title}</h6>
                                        <StyledTable className="mb-4">
                                            <tbody>
                                                {map(entries, ([key, value]) => (
                                                    <tr key={key}>
                                                        <td>{key}</td>
                                                        <td>{value}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </StyledTable>
                                    </div>
                                ))}
                            </CardBody>
                        </Card>
                    </div>
                </div>
                : 'Loading...'}
            </CardBody>}
        </Card>
    );
}
