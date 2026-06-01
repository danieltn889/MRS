// contracts/LocalSimulation.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract LocalSimulation {
    struct Result {
        string sessionId;
        address candidate;
        uint256 overallScore;
        uint256 technicalScore;
        uint256 punctualityScore;
        uint256 adaptabilityScore;
        uint256 githubScore;
        uint256 timestamp;
        bool verified;
    }
    
    mapping(string => Result) public results;
    mapping(address => string[]) public userResults;
    
    event ResultStored(string indexed sessionId, address indexed candidate, uint256 score);
    event ResultVerified(string indexed sessionId);
    
    function storeResult(
        string memory sessionId,
        address candidate,
        uint256 overallScore,
        uint256 technicalScore,
        uint256 punctualityScore,
        uint256 adaptabilityScore,
        uint256 githubScore
    ) public {
        require(overallScore <= 100, "Score must be <= 100");
        
        results[sessionId] = Result({
            sessionId: sessionId,
            candidate: candidate,
            overallScore: overallScore,
            technicalScore: technicalScore,
            punctualityScore: punctualityScore,
            adaptabilityScore: adaptabilityScore,
            githubScore: githubScore,
            timestamp: block.timestamp,
            verified: false
        });
        
        userResults[candidate].push(sessionId);
        
        emit ResultStored(sessionId, candidate, overallScore);
    }
    
    function getResult(string memory sessionId) public view returns (
        address candidate,
        uint256 overallScore,
        uint256 timestamp,
        bool verified
    ) {
        Result memory result = results[sessionId];
        return (
            result.candidate,
            result.overallScore,
            result.timestamp,
            result.verified
        );
    }
    
    function verifyResult(string memory sessionId) public {
        results[sessionId].verified = true;
        emit ResultVerified(sessionId);
    }
}